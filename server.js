// FighterBot — dummy responder for end-to-end infrastructure test.
// One job: Telegram webhook in -> Claude reply out. No tools, no memory, no Mastra yet.

import http from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { sendTelegramMessage } from "./lib/telegram.js";

const PORT = process.env.PORT || 8080;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// Chat whitelist (spec §15): admin DM + test group, from env (not a secret,
// just not something someone else's clone of this repo should inherit).
const ALLOWED_CHAT_IDS = new Set(
  (process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .filter(Boolean)
    .map(Number),
);

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT =
  "You are FighterBot, a Telegram bot that will eventually track MMA fighters " +
  "(Fighter A, Fighter B, Fighter C) for a group of Ukrainian MMA fans. " +
  "Right now you are a bare-bones test version with no tools, no news access, and no memory — " +
  "each message reaches you in isolation. Be honest about that when asked. " +
  "Keep replies short and chat-friendly. Reply in the language the user writes in.";

async function askClaude(userText) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
  });
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.text) return; // ignore joins, edits, stickers, etc.

  const chatId = message.chat.id;
  if (!ALLOWED_CHAT_IDS.has(chatId)) {
    // Log so a group->supergroup ID change doesn't look like an outage (spec §15).
    console.warn("Dropped update from non-whitelisted chat:", chatId, message.chat.type);
    return;
  }

  console.log(`Message in ${chatId}: ${message.text.slice(0, 80)}`);
  const reply = await askClaude(message.text);
  await sendTelegramMessage(chatId, reply);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Health check / hello page.
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("FighterBot dummy is alive.\n");
    return;
  }

  if (req.method === "POST" && req.url === "/webhook") {
    // The lock (spec §7): reject anything not carrying Telegram's secret token header.
    if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const update = JSON.parse(await readBody(req));
      // Request-based billing (spec §16.3): finish the work BEFORE responding 200,
      // because CPU is throttled once the response is sent.
      await handleUpdate(update);
    } catch (err) {
      // Log but still 200 — otherwise Telegram retries the same update in a loop.
      console.error("Error handling update:", err);
    }
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`FighterBot dummy listening on :${PORT}`);
});
