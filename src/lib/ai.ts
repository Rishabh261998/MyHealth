import "server-only";

/** Whether the AI features (photo analysis, the coach) are available on this deployment. */
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const AI_MODEL = "claude-sonnet-5-5";

/** The model behind the conversational AI coach. */
export const COACH_MODEL = "claude-opus-5-5";
