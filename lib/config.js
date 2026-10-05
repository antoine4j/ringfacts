// Unpacks production's one configuration secret into the variables the code
// already reads. On Cloud Run, the ringfacts-config secret arrives whole as
// RINGFACTS_CONFIG (one JSON object); this module checks every value is there
// and copies each into process.env, so no other file changes. Locally there is
// no RINGFACTS_CONFIG and nothing happens: development and the bench keep
// their .env files.
//
// Imported first by hunter.js and server.js, because lib/telegram.js and
// server.js read their values the moment they load.
// History: docs/decisions.md#one-config-secret

export const CONFIG_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_IDS",
  "TELEGRAM_WEBHOOK_SECRET",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
];

/**
 * The six values from the secret's JSON, each checked to be present.
 *
 * @param {string} raw  The secret's contents.
 * @returns {Record<string, string>}  Variable name → value; the chat ids as their own JSON line.
 */
export function parseConfig(raw) {
  // The secret must be one JSON object.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("RINGFACTS_CONFIG is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("RINGFACTS_CONFIG must be a JSON object");
  }

  // Every value present and not empty; the chat ids may be stored as an object.
  const values = {};
  for (const key of CONFIG_KEYS) {
    const value = parsed[key];
    const isObject = value !== null && typeof value === "object";
    const text = isObject ? JSON.stringify(value) : value;
    if (typeof text !== "string" || text.trim() === "") {
      throw new Error(`RINGFACTS_CONFIG has no ${key}`);
    }
    values[key] = text;
  }
  return values;
}

/**
 * Copies the secret's values into the environment, never over a value already set.
 *
 * @param {Record<string, string | undefined>} env  The environment to fill.
 * @returns {string[]}  The names it set.
 */
export function applyConfig(env = process.env) {
  const raw = env.RINGFACTS_CONFIG;
  if (raw === undefined || raw === "") return [];
  const set = [];
  for (const [key, value] of Object.entries(parseConfig(raw))) {
    if (env[key] !== undefined && env[key] !== "") continue;
    env[key] = value;
    set.push(key);
  }
  return set;
}

applyConfig();
