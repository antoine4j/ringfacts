// FighterBot hunter — raw-pipe skeleton (spec §9 step 2, first half).
// Runs top to bottom and exits: fetch Google News RSS per fighter -> parse ->
// post fresh items to the Telegram group, unfiltered. No storage yet, so every
// run re-posts what it finds — dedup arrives with Supabase in the next step.
//
// DRY_RUN=1 prints to stdout instead of posting (local testing, no secrets).

import { sendTelegramMessage } from "./lib/telegram.js";

const DRY_RUN = process.env.DRY_RUN === "1";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HOURS_BACK = Number(process.env.HOURS_BACK || 24);
const MAX_ITEMS_PER_FIGHTER = 5;

// Aliases are search queries, not display names. First draft (spec §17.4 is
// still open): Cyrillic aliases matter most for the fighters western media
// ignores. Each alias pairs with a Google News language edition.
const FIGHTERS = [
  {
    name: "Fighter A",
    aliases: [
      { query: '"Fighter A"', edition: "en" },
      { query: '"Fighter A"', edition: "uk" },
    ],
  },
  {
    name: "Fighter B",
    aliases: [
      { query: '"Fighter B"', edition: "en" },
      { query: '"Fighter B"', edition: "uk" },
    ],
  },
  {
    name: "Fighter C",
    aliases: [{ query: '"Fighter C"', edition: "en" }],
  },
];

// Google News RSS needs matching language/country params per edition,
// otherwise Cyrillic queries return the (empty) English edition.
const EDITIONS = {
  en: "hl=en-US&gl=US&ceid=US:en",
  uk: "hl=uk&gl=UA&ceid=UA:uk",
};

function feedUrl(alias) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(alias.query) +
    "&" +
    EDITIONS[alias.edition]
  );
}

// RSS is machine-generated and regular, so a regex parse is fine at this
// stage; a real XML parser can come in when we add messier sources.
function parseRssItems(xml) {
  const items = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag) =>
      decodeEntities(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
    items.push({
      title: pick("title"),
      link: pick("link"),
      source: pick("source"),
      publishedAt: new Date(block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? 0),
    });
  }
  return items;
}

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hoursAgo(date) {
  return Math.round((Date.now() - date.getTime()) / 3_600_000);
}

async function huntFighter(fighter) {
  const cutoff = Date.now() - HOURS_BACK * 3_600_000;
  const items = [];
  for (const alias of fighter.aliases) {
    const res = await fetch(feedUrl(alias));
    if (!res.ok) throw new Error(`RSS fetch ${res.status} for ${alias.query}`);
    items.push(...parseRssItems(await res.text()));
  }
  // Fresh only, newest first, capped. Cross-alias URL dedup handles the same
  // story appearing in both language editions.
  const seenLinks = new Set();
  return items
    .filter((item) => item.publishedAt.getTime() > cutoff)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((item) => !seenLinks.has(item.link) && seenLinks.add(item.link))
    .slice(0, MAX_ITEMS_PER_FIGHTER);
}

function formatMessage(fighter, items) {
  const lines = items.map(
    (item) => `• ${item.title} (${item.source}, ${hoursAgo(item.publishedAt)}h ago)\n${item.link}`
  );
  return `🔎 ${fighter.name} — ${items.length} item(s) in the last ${HOURS_BACK}h:\n\n${lines.join("\n\n")}`;
}

async function main() {
  if (!DRY_RUN && !CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is required unless DRY_RUN=1");
  }

  let failures = 0;
  for (const fighter of FIGHTERS) {
    try {
      const items = await huntFighter(fighter);
      console.log(`${fighter.name}: ${items.length} fresh item(s)`);
      if (items.length === 0) continue; // silence beats "no news" spam
      const message = formatMessage(fighter, items);
      if (DRY_RUN) {
        console.log(`\n--- would post ---\n${message}\n`);
      } else {
        await sendTelegramMessage(CHAT_ID, message);
      }
    } catch (err) {
      // One broken feed must not kill the other fighters' hunts.
      failures++;
      console.error(`${fighter.name}: hunt failed:`, err);
    }
  }

  if (failures === FIGHTERS.length) {
    throw new Error("every fighter hunt failed"); // job run shows red
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
