// FighterBot hunter — slice 2b: memory + dedup.
// Each run: fetch Google News RSS per fighter -> drop URLs already in the DB
// -> embed the rest -> hold back semantic duplicates (same story, different
// outlet/language) -> post what's genuinely new -> record everything.
//
// Degradation ladder: no DATABASE_URL -> no dedup (local dry runs);
// embedding API down -> URL dedup only. DB configured but unreachable is
// fatal — posting without memory would re-spam the group.
//
// DRY_RUN=1 prints instead of posting and skips DB writes (reads still work).

import { sendTelegramMessage, escapeHtml } from "./lib/telegram.js";
import { openDb, knownUrls, nearestRecent, insertItem } from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";

const DRY_RUN = process.env.DRY_RUN === "1";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HOURS_BACK = Number(process.env.HOURS_BACK || 24);
const MAX_ITEMS_PER_FIGHTER = 5;
// Cosine similarity above this = same story. Tuned on real data 2026-08-06:
// a UK<->EN translated pair measured 0.841; unrelated same-fighter pairs
// topped out at 0.702. 0.80 splits that gap.
const SEMANTIC_DUP_THRESHOLD = Number(process.env.SEMANTIC_DUP_THRESHOLD || 0.8);

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
      url: pick("link"),
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

async function fetchFreshItems(fighter) {
  const cutoff = Date.now() - HOURS_BACK * 3_600_000;
  const items = [];
  for (const alias of fighter.aliases) {
    const res = await fetch(feedUrl(alias));
    if (!res.ok) throw new Error(`RSS fetch ${res.status} for ${alias.query}`);
    items.push(...parseRssItems(await res.text()));
  }
  // Fresh only, newest first, capped. In-run URL dedup across aliases;
  // cross-run dedup is the database's job.
  const seen = new Set();
  return items
    .filter((item) => item.publishedAt.getTime() > cutoff)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((item) => !seen.has(item.url) && seen.add(item.url))
    .slice(0, MAX_ITEMS_PER_FIGHTER);
}

// Telegram HTML mode: headline stays plain text (calmer to read), the short
// source name carries the link — hiding the ugly Google News URL behind it.
// Google News titles end in " - Source"; we show the source ourselves, so
// strip that suffix when it matches.
function formatMessage(fighter, items) {
  const lines = items.map((item) => {
    const title = item.title.endsWith(` - ${item.source}`)
      ? item.title.slice(0, -` - ${item.source}`.length)
      : item.title;
    return `• ${escapeHtml(title)} — <a href="${item.url}">${escapeHtml(item.source)}</a>, ${hoursAgo(item.publishedAt)}h ago`;
  });
  return `🔎 <b>${escapeHtml(fighter.name)}</b>\n${lines.join("\n")}`;
}

async function huntFighter(db, fighter) {
  const fetched = await fetchFreshItems(fighter);

  // Gate 1: exact URLs we already know.
  const known = db ? await knownUrls(db, fetched.map((i) => i.url)) : new Set();
  const candidates = fetched.filter((i) => !known.has(i.url));
  if (candidates.length === 0) {
    console.log(`${fighter.name}: ${fetched.length} fetched, nothing new`);
    return;
  }

  // Gate 2: semantic duplicates. Embedding failure degrades to URL-only dedup.
  let vectors = null;
  if (db) {
    try {
      vectors = await embedTexts(candidates.map((i) => i.title));
    } catch (err) {
      console.warn(`${fighter.name}: embedding failed, URL dedup only:`, err.message);
    }
  }

  const toPost = [];
  for (const [i, item] of candidates.entries()) {
    item.fighter = fighter.name;
    item.embedding = vectors?.[i] ?? null;
    item.embeddingModel = EMBEDDING_MODEL;

    // Compare against stored rows BEFORE inserting this one, so an item
    // never matches itself.
    const nearest = item.embedding ? await nearestRecent(db, fighter.name, item.embedding) : null;
    const isDup = nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD;
    item.posted = !isDup;

    if (isDup) {
      console.log(
        `${fighter.name}: held as dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
    } else {
      toPost.push(item);
    }
    if (db && !DRY_RUN) await insertItem(db, item);
  }

  console.log(
    `${fighter.name}: ${fetched.length} fetched, ${candidates.length} unseen, ${toPost.length} posted`
  );
  if (toPost.length === 0) return;

  const message = formatMessage(fighter, toPost);
  if (DRY_RUN) {
    console.log(`\n--- would post ---\n${message}\n`);
  } else {
    await sendTelegramMessage(CHAT_ID, message, { html: true, noPreview: true });
  }
}

async function main() {
  if (!DRY_RUN && !CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is required unless DRY_RUN=1");
  }
  // No DATABASE_URL (secret-free local run) -> no dedup. But if a DB is
  // configured and unreachable, fail the whole run: memory-less posting
  // would re-spam the group every hour.
  const db = process.env.DATABASE_URL ? await openDb() : null;
  if (!db) console.warn("No DATABASE_URL — running without dedup memory.");

  try {
    let failures = 0;
    for (const fighter of FIGHTERS) {
      try {
        await huntFighter(db, fighter);
      } catch (err) {
        // One broken feed must not kill the other fighters' hunts.
        failures++;
        console.error(`${fighter.name}: hunt failed:`, err);
      }
    }
    if (failures === FIGHTERS.length) {
      throw new Error("every fighter hunt failed"); // job run shows red
    }
  } finally {
    if (db) await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
