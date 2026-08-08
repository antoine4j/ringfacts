// Shared Telegram helpers — used by both the responder (server.js) and the
// hunter (hunter.js). One copy of the code, one behavior everywhere.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Options:
//   html: true       -> parse_mode HTML (caller MUST escape <, >, & in text;
//                       plain default stays safe for LLM output).
//   noPreview: true  -> suppress the link preview card.
//   replyTo: <id>    -> send as a reply to that message (claim lifecycle:
//                       confirmations thread onto the original rumor post).
// Returns the sent message's id (for claims.tg_message_id), or null on failure.
export async function sendTelegramMessage(chatId, text, { html = false, noPreview = false, replyTo = null } = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(html && { parse_mode: "HTML" }),
      ...(noPreview && { link_preview_options: { is_disabled: true } }),
      ...(replyTo && { reply_parameters: { message_id: replyTo } }),
    }),
  });
  if (!res.ok) {
    console.error("sendMessage failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.result?.message_id ?? null;
}

// Minimal escaping for Telegram HTML parse mode (only these three matter).
export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
