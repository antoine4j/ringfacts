// Unpacks v0's one secret, v0-config, into the variables run.ts reads. On
// Cloud Run it arrives whole as V0_CONFIG (one JSON object); locally there is
// none and the values come from .env.v0 as before. Every key but the chat id
// must be present: without a chat id the job runs and prints its posts.
// History: docs/decisions.md#one-config-secret

export const REQUIRED_KEYS = ["JEV_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "V0_DATABASE_URL", "V0_FEED_DATABASE_URL"];
export const OPTIONAL_KEYS = ["TELEGRAM_CHAT_ID"];

/**
 * Copies V0_CONFIG's values into the environment, never over a value already set.
 *
 * @param env  The environment to fill.
 * @returns The names it set.
 */
export function applyV0Config(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.V0_CONFIG;
  if (raw === undefined || raw === "") return [];
  const parsed = JSON.parse(raw);

  // A missing required value stops the start; the chat id may be empty.
  for (const key of REQUIRED_KEYS) {
    if (typeof parsed[key] !== "string" || parsed[key].trim() === "") throw new Error(`V0_CONFIG has no ${key}`);
  }
  const set: string[] = [];
  for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
    const value = parsed[key];
    if (typeof value !== "string" || value === "") continue;
    if (env[key] !== undefined && env[key] !== "") continue;
    env[key] = value;
    set.push(key);
  }
  return set;
}

applyV0Config();
