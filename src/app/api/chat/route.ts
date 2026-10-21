import { NextResponse } from "next/server";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { COACH_MODEL, aiConfigured } from "@/lib/ai";
import { buildCoachSnapshot } from "@/lib/coach-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 2000;
const MAX_USER_TURNS_PER_CONVERSATION = 40;
const MAX_USER_TURNS_PER_DAY = 100;

const bodySchema = z.object({
  conversationId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

/**
 * Frozen for the life of every conversation: anything that changes (the
 * user's data, today's date) goes into the conversation as a system message
 * instead, so the cached prefix and the model's preserved thinking stay valid.
 */
const SYSTEM_PROMPT = `You are the AI coach inside MyHealth, a personal app for tracking strength training, cardio, nutrition, body weight and recovery. You talk with one person about their own training and diet.

Messages labelled "Health snapshot" come from the app, not the person: they hold the person's current data (plan, recent sessions, personal records, weight trend, today's food and water, recovery, journal). A newer snapshot replaces older ones. Base your advice on that data and refer to specific numbers when they matter. If something you need is not in the snapshot, say what is missing and how to log it in the app rather than guessing.

How to answer:
- This is read on a phone. Keep it short: a few sentences or a short list, unless the person asks for a full plan or a detailed explanation.
- Write plain text. Hyphen bullets and numbered steps are fine; no headings, tables or bold.
- Be direct and practical, like a good strength coach: give a concrete recommendation (sets, reps, loads in the person's unit, foods, amounts) and a one-line reason.
- Be honest when the data shows a problem, and encouraging without exaggerating.

Boundaries:
- You are not a doctor or dietitian. Do not diagnose, and do not advise on medication or supplements beyond widely accepted basics.
- Pain that is sharp, worsening or lasting, chest pain, dizziness, fainting or similar: tell them to stop training and see a medical professional.
- Do not encourage extreme restriction, very low calorie diets or rapid weight loss. If the person shows signs of disordered eating, respond with care and suggest talking to a professional.`;

type Row = { role: "user" | "assistant" | "system"; content: unknown };

/**
 * After a mid-answer fallback to another model, the blocks the first model
 * produced before the hand-over that are not plain text must not be sent back.
 * Everything from the final fallback block on, and all text, is kept as-is.
 */
function contentToStore(content: Anthropic.Beta.BetaContentBlock[]) {
  const boundary = content.map((b) => b.type).lastIndexOf("fallback");
  if (boundary < 0) return content;
  const internal = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);
  return content.filter((block, i) => i >= boundary || !internal.has(block.type));
}

function line(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function describeError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) {
    return "Your ANTHROPIC_API_KEY was rejected. Check the key in your deployment's environment variables.";
  }
  if (status === 429) return "The coach is getting too many requests right now. Wait a minute and try again.";
  if (status === 529 || (typeof status === "number" && status >= 500)) {
    return "The AI service had a problem on its side. Try again shortly.";
  }
  return "The coach could not answer just now. Try again.";
}

/**
 * Send one message to the AI coach. Responds with newline-delimited JSON:
 * `{"t":"delta","text":...}` while the answer streams, then `{"t":"done"}` or
 * `{"t":"error","message":...}`. The exchange is saved only once the answer
 * completes, so a failed or abandoned reply leaves no half-turn behind.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json(
      {
        error:
          "The AI coach is not set up. Add an ANTHROPIC_API_KEY environment variable to your deployment to turn it on.",
      },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Messages must be between 1 and ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 },
    );
  }
  const { conversationId, message } = parsed.data;

  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, user.id),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  if ((today?.n ?? 0) >= MAX_USER_TURNS_PER_DAY) {
    return NextResponse.json(
      { error: "You've reached today's message limit for the coach. Try again tomorrow." },
      { status: 429 },
    );
  }

  const history = (await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, user.id), eq(chatMessages.conversationId, conversationId)))
    .orderBy(asc(chatMessages.id))) as Row[];

  if (history.filter((r) => r.role === "user").length >= MAX_USER_TURNS_PER_CONVERSATION) {
    return NextResponse.json(
      { error: "This conversation is full. Start a new chat to keep going." },
      { status: 400 },
    );
  }

  // History is append-only: the new turn is the user's message, followed by a
  // fresh data snapshot only when the data has changed since the last one.
  const snapshot = `Health snapshot\n\n${await buildCoachSnapshot(user)}`;
  const lastSnapshot = history.filter((r) => r.role === "system").at(-1)?.content;
  const newRows: Row[] = [{ role: "user", content: message }];
  if (snapshot !== lastSnapshot) newRows.push({ role: "system", content: snapshot });

  const messages = [...history, ...newRows].map(
    (r) => ({ role: r.role, content: r.content }) as Anthropic.Beta.BetaMessageParam,
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stream = client.beta.messages.stream({
        model: COACH_MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages,
        // Thinking cannot be turned off on this model. If an earlier thinking
        // block ever fails the conversation check, drop it rather than fail.
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        output_config: { effort: "low" },
        // If the model declines, the API retries on its default fallback model
        // within the same request instead of returning a refusal.
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
      });

      const abort = () => stream.abort();
      request.signal.addEventListener("abort", abort);

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(line({ t: "delta", text: event.delta.text }));
          }
        }
        const final = await stream.finalMessage();

        if (final.stop_reason === "refusal") {
          controller.enqueue(
            line({ t: "error", message: "The coach can't help with that one. Try asking another way." }),
          );
          return;
        }

        const text = final.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (!text) {
          controller.enqueue(line({ t: "error", message: "The coach's answer came back empty. Try again." }));
          return;
        }

        await db.insert(chatMessages).values(
          [...newRows, { role: "assistant" as const, content: contentToStore(final.content) }].map(
            (r) => ({ userId: user.id, conversationId, role: r.role, content: r.content }),
          ),
        );
        controller.enqueue(line({ t: "done" }));
      } catch (err) {
        if (!request.signal.aborted) {
          console.error("coach chat failed", err);
          controller.enqueue(line({ t: "error", message: describeError(err) }));
        }
      } finally {
        request.signal.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
