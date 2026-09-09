import "server-only";

/** Whether progress-photo analysis is available on this deployment. */
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const AI_MODEL = "claude-sonnet-5";
