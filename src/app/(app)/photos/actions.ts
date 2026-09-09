"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { bodyMetrics, photoAnalyses, photos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, prettyDate } from "@/lib/dates";
import { fmtWeight } from "@/lib/units";
import { AI_MODEL, aiConfigured } from "@/lib/ai";

const MODEL = AI_MODEL;
const MAX_DATA_URL_CHARS = 900_000; // ~650 KB of JPEG, plenty for a resized photo

const uploadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pose: z.enum(["front", "side", "back"]),
  dataUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Unsupported image format.")
    .max(MAX_DATA_URL_CHARS, "That image is too large — try again, it should be resized in the browser."),
  notes: z.string().max(500).optional(),
});

export async function uploadPhoto(input: z.infer<typeof uploadSchema>) {
  const user = await requireUser();
  const data = uploadSchema.parse(input);

  // Attach the nearest body weight so the photo carries context later.
  const [metric] = await db
    .select({ weightKg: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, user.id), eq(bodyMetrics.date, data.date)))
    .limit(1);

  await db.insert(photos).values({
    userId: user.id,
    date: data.date,
    pose: data.pose,
    dataUrl: data.dataUrl,
    weightKg: metric?.weightKg ?? null,
    notes: data.notes ?? "",
  });

  revalidatePath("/photos");
  return { ok: true as const };
}

export async function deletePhoto(id: number) {
  const user = await requireUser();
  await db.delete(photos).where(and(eq(photos.id, id), eq(photos.userId, user.id)));
  revalidatePath("/photos");
}

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
};

function toImageBlock(dataUrl: string): ImageBlock {
  const [header, base64] = dataUrl.split(",");
  const match = header.match(/^data:(image\/(?:jpeg|png|webp));base64$/);
  if (!match || !base64) throw new Error("That photo could not be read.");
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1] as ImageBlock["source"]["media_type"],
      data: base64,
    },
  };
}

/**
 * Ask Claude to describe what changed between two progress photos (or to read a
 * single one). Deliberately framed as visual observation, not a health verdict.
 */
export async function analyzePhotos(photoId: number, comparePhotoId?: number) {
  const user = await requireUser();

  if (!aiConfigured()) {
    return {
      ok: false as const,
      error:
        "AI analysis is not set up. Add an ANTHROPIC_API_KEY environment variable to your deployment to turn it on.",
    };
  }

  const ids = comparePhotoId ? [photoId, comparePhotoId] : [photoId];
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.userId, user.id), inArray(photos.id, ids)));

  const main = rows.find((r) => r.id === photoId);
  const other = comparePhotoId ? rows.find((r) => r.id === comparePhotoId) : undefined;
  if (!main) return { ok: false as const, error: "Photo not found." };

  const context: string[] = [];
  if (other) {
    const gap = Math.abs(daysBetween(other.date, main.date));
    context.push(
      `Photo A was taken on ${prettyDate(other.date)} (${other.pose} pose)` +
        (other.weightKg ? ` at ${fmtWeight(other.weightKg, user.unit)}` : "") +
        ".",
      `Photo B was taken on ${prettyDate(main.date)} (${main.pose} pose)` +
        (main.weightKg ? ` at ${fmtWeight(main.weightKg, user.unit)}` : "") +
        `, ${gap} days later.`,
    );
  } else {
    context.push(
      `The photo was taken on ${prettyDate(main.date)} (${main.pose} pose)` +
        (main.weightKg ? ` at ${fmtWeight(main.weightKg, user.unit)}` : "") +
        ".",
    );
  }

  const instruction = other
    ? `Compare these two progress photos of the same person and describe what visibly changed between A and B. Cover posture, apparent muscle definition by region (shoulders, chest, arms, back, waist, legs), and overall body composition. Say clearly when a difference could just be lighting, angle, pose or pump rather than real change.`
    : `Describe what this progress photo shows: visible muscle development by region, posture, and overall composition. Note anything about the photo itself (lighting, angle, distance) that would make future comparisons hard.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content: (ImageBlock | { type: "text"; text: string })[] = [];
  if (other) {
    content.push({ type: "text", text: "Photo A (earlier):" }, toImageBlock(other.dataUrl));
    content.push({ type: "text", text: "Photo B (later):" }, toImageBlock(main.dataUrl));
  } else {
    content.push(toImageBlock(main.dataUrl));
  }
  content.push({
    type: "text",
    text: `${instruction}\n\nContext:\n${context.join("\n")}\n\nWrite 120-200 words in plain language, second person ("you"). Finish with one short line starting "Next:" giving the single most useful training or nutrition adjustment. Do not estimate body fat percentage as a precise number, do not diagnose anything medical, and do not comment on appearance beyond training progress.`,
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system:
        "You are a supportive, straight-talking strength coach reviewing a client's progress photos. You are observing pixels, not examining a person: hedge appropriately, never give medical advice, and never comment on attractiveness. Be specific and encouraging without exaggerating small changes.",
      messages: [{ role: "user", content }],
    });

    const summary = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    await db.insert(photoAnalyses).values({
      userId: user.id,
      photoId: main.id,
      comparePhotoId: other?.id ?? null,
      model: MODEL,
      summary,
      data: { context },
    });

    revalidatePath("/photos");
    return { ok: true as const, summary };
  } catch (err) {
    return { ok: false as const, error: describeAiError(err) };
  }
}

/** Turn SDK errors into something worth reading on a phone. */
function describeAiError(err: unknown): string {
  const status = (err as { status?: number })?.status;

  if (status === 401 || status === 403) {
    return "Your ANTHROPIC_API_KEY was rejected. Check the key in your deployment's environment variables.";
  }
  if (status === 429) {
    return "The API is rate limiting you right now. Wait a minute and try again.";
  }
  if (status === 400) {
    return "The API could not read that image. Try re-taking the photo.";
  }
  if (typeof status === "number" && status >= 500) {
    return "The API had a problem on its side. Try again shortly.";
  }
  return err instanceof Error
    ? `The analysis request failed: ${err.message}`
    : "The analysis request failed.";
}
