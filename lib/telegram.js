// Shared Telegram helpers — used by both the responder (server.js) and the
// hunter (hunter.js). One copy of the code, one behavior everywhere.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Options:
//   html: true       -> parse_mode HTML (caller MUST escape <, >, & in text;
//                       plain default stays safe for LLM output).
//   noPreview: true  -> suppress the link preview card (digests with many
//                       links would otherwise grow a giant preview).
export async function sendTelegramMessage(chatId, text, { html = false, noPreview = false } = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(html && { parse_mode: "HTML" }),
      ...(noPreview && { link_preview_options: { is_disabled: true } }),
    }),
  });
  if (!res.ok) {
    console.error("sendMessage failed:", res.status, await res.text());
  }
}

// Minimal escaping for Telegram HTML parse mode (only these three matter).
export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
