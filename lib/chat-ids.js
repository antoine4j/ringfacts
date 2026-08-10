// Every Telegram chat identifier the bot needs, resolved in one place.
//
// Why this file exists (2026-08-09 → 2026-08-10):
//
// These three values used to be literal text inside two deploy commands —
// TELEGRAM_CHAT_ID and ADMIN_CHAT_ID on the hunter job, ALLOWED_CHAT_IDS on
// the webhook service. `gcloud run deploy --set-env-vars` REPLACES the whole
// variable list rather than merging into it, so every deploy had to retype
// all three correctly, from whatever shell happened to be running it. Two
// deploys did not: one wrote an empty string, one wrote the eleven characters
// ['-4812309756']. Neither is an error to a shell or to gcloud — both are
// perfectly good strings — so nothing failed at startup. The hunter posted
// into the void for twenty hours while the archive recorded every item as
// delivered, and no database query could have disagreed.
//
// The fix has two halves, and both live here.
//
// 1. ONE SOURCE. All three come from a single Secret Manager secret, mounted
//    as TELEGRAM_CHAT_IDS. The deploy now carries the secret's NAME, never its
//    contents — the same treatment the bot token and the database URL always
//    had, which is exactly why those two never broke. A deploy can no longer
//    corrupt a value it never touches.
//
// 2. REFUSE, DON'T LIMP. A chat id that is not a bare integer is a
//    configuration error, and parseChatIds throws instead of handing Telegram
//    something it will reject one message at a time. Loud at startup beats
//    silent for twenty hours.
//
// Payload format (the secret's entire contents, one line, no trailing
// newline — see setup.sh's day-one `tr -d '\n'` lesson):
//
//     {"group":"-1001234567890","admin":"481526390"}
//
// `allowed` is DERIVED from those two rather than stored, because the webhook
// whitelist was only ever the same two numbers in a third shape. Three copies
// of one fact is three chances to disagree.

const TELEGRAM_ID = /^-?[0-9]+$/;

// Telegram ids are integers, but they run past 2^31 and group ids are
// negative, so they are carried as STRINGS everywhere they are sent to the
// API. `allowed` is the exception: server.js compares against
// `message.chat.id`, which arrives from Telegram's JSON as a number.
function requireId(value, field) {
  if (typeof value !== "string" || !TELEGRAM_ID.test(value)) {
    throw new Error(
      `TELEGRAM_CHAT_IDS.${field} must be a bare integer as a string, got ${JSON.stringify(value)}`
    );
  }
  return value;
}

// Pure, so the failure modes that caused the outage are directly testable.
// Throws on anything it cannot vouch for — never returns a partial answer.
export function parseChatIds(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(
      'TELEGRAM_CHAT_IDS is empty — expected {"group":"...","admin":"..."} ' +
        "from the telegram-chat-ids secret"
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `TELEGRAM_CHAT_IDS is not valid JSON: ${JSON.stringify(raw.slice(0, 60))}`
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`TELEGRAM_CHAT_IDS must be a JSON object, got ${JSON.stringify(parsed)}`);
  }

  const group = requireId(parsed.group, "group");
  const admin = requireId(parsed.admin, "admin");
  return { group, admin, allowed: [Number(admin), Number(group)] };
}

// The env-reading wrapper. `required: false` tolerates the variable being
// ABSENT (DRY_RUN runs and the offline test suite have no chat to post to),
// but never tolerates it being PRESENT and malformed — a dry run that reads
// a broken config should say so, since that is the run whose whole job is to
// find out whether the next real one will work.
export function readChatIds({ env = process.env, required = true } = {}) {
  const raw = env.TELEGRAM_CHAT_IDS;
  if ((raw === undefined || raw === "") && !required) {
    return { group: null, admin: null, allowed: [] };
  }
  return parseChatIds(raw);
}
