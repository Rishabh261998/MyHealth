import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai";
import CoachChat, { type ChatTurn } from "./CoachChat";

export const dynamic = "force-dynamic";

/** The visible text of a stored message; system snapshots are never shown. */
function visibleText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c } = await searchParams;

  // Open the requested conversation, else pick up the most recent one.
  let conversationId = c && /^[A-Za-z0-9-]{8,64}$/.test(c) ? c : null;
  if (!conversationId) {
    const [latest] = await db
      .select({ id: chatMessages.conversationId })
      .from(chatMessages)
      .where(eq(chatMessages.userId, user.id))
      .orderBy(desc(chatMessages.id))
      .limit(1);
    conversationId = latest?.id ?? null;
  }

  const rows = conversationId
    ? await db
        .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(
          and(eq(chatMessages.userId, user.id), eq(chatMessages.conversationId, conversationId)),
        )
        .orderBy(asc(chatMessages.id))
    : [];

  const turns: ChatTurn[] = rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      id: String(r.id),
      role: r.role as ChatTurn["role"],
      text: visibleText(r.content),
    }))
    .filter((t) => t.text);

  return (
    <>
      <PageHeader
        title="AI Coach"
        subtitle="Ask about your training, diet and recovery"
        back="/more"
      />
      <CoachChat
        key={conversationId ?? "new"}
        conversationId={conversationId}
        initialTurns={turns}
        aiEnabled={aiConfigured()}
      />
    </>
  );
}
