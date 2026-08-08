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
import {
  openDb, knownUrls, nearestRecent, insertItem,
  activeClaims, insertClaim, linkClaimSource, claimOfItem, setClaimMessageId, confirmClaim,
} from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";
import { translateToEnglish } from "./lib/translate.js";
import { matchItem } from "./lib/matcher.js";

// Official sources born-confirm claims (docs §6/§11, resolved 2026-08-08).
// v1 list = ufc.com only; pflmma.com parked until a watched fighter signs there.
function isOfficialSource(source) {
  return /^ufc(\.com)?$/i.test(source.trim());
}

// Editions the group reads as-is. Headlines from any other edition are
// translated to English at posting time, labeled as translated (§17.5:
// the DB keeps originals; translation is presentation only).
const GROUP_LANGUAGES = new Set(["en", "uk"]);

const DRY_RUN = process.env.DRY_RUN === "1";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // failure DMs go here, never the group
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
    aliases: [
      { query: '"Fighter C"', edition: "en" },
      // Same Latin spelling in Spanish — only the edition differs. Spain's
      // press covers him as a domestic athlete (added 2026-08-07).
      { query: '"Fighter C"', edition: "es" },
    ],
  },
];

// Google News RSS needs matching language/country params per edition,
// otherwise Cyrillic queries return the (empty) English edition.
const EDITIONS = {
  en: "hl=en-US&gl=US&ceid=US:en",
  uk: "hl=uk&gl=UA&ceid=UA:uk",
  es: "hl=es&gl=ES&ceid=ES:es",
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
      // Raw description kept for later mining — Google News packs
      // related-coverage links (its own story clustering) in here.
      rssDescription: pick("description") || null,
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

// Google News intermittently sheds load from cloud-datacenter IPs (503s,
// ~1-2 runs/day observed). One retry after a pause rides out the wave;
// worst case (all aliases failing twice) stays within the job timeout.
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 75_000); // 30s proved too short for Google's waves

async function fetchFeed(alias) {
  let res = await fetch(feedUrl(alias));
  if (!res.ok) {
    console.warn(`RSS fetch ${res.status} for ${alias.query} — retrying in ${RETRY_DELAY_MS / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    res = await fetch(feedUrl(alias));
  }
  if (!res.ok) throw new Error(`RSS fetch ${res.status} for ${alias.query} (after retry)`);
  return res.text();
}

async function fetchFreshItems(fighter) {
  const cutoff = Date.now() - HOURS_BACK * 3_600_000;
  const items = [];
  for (const alias of fighter.aliases) {
    const found = parseRssItems(await fetchFeed(alias));
    for (const item of found) {
      item.edition = alias.edition;
      item.foundVia = `${alias.edition} ${alias.query}`;
    }
    items.push(...found);
  }
  // Fresh only, newest first. In-run URL dedup across aliases; cross-run
  // dedup is the database's job. NOTE: no cap here — capping before the
  // known-URL check would let newer known items permanently shadow older
  // unseen ones. The cap is applied to unseen candidates in huntFighter.
  const seen = new Set();
  return items
    .filter((item) => item.publishedAt.getTime() > cutoff)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((item) => !seen.has(item.url) && seen.add(item.url));
}

// Google News titles end in " - Source"; we show the source ourselves, so
// strip that suffix when it matches.
function cleanTitle(item) {
  return item.title.endsWith(` - ${item.source}`)
    ? item.title.slice(0, -` - ${item.source}`.length)
    : item.title;
}

// Telegram HTML mode: headline stays plain text (calmer to read), the short
// source name carries the link. Translated headlines are labeled — never
// presented as the original.
function digestLine(item) {
  const title = item.displayTitle ?? cleanTitle(item);
  const label = item.displayTitle ? ` (translated from ${item.edition})` : "";
  return `• ${escapeHtml(title)} — <a href="${item.url}">${escapeHtml(item.source)}</a>${label}, ${hoursAgo(item.publishedAt)}h ago`;
}

async function huntFighter(db, fighter) {
  const fetched = await fetchFreshItems(fighter);

  // Gate 1: exact URLs we already know. Flood cap applies to UNSEEN items
  // (newest first), so a busy-day backlog drains at 5/run across successive
  // sweeps instead of being shadowed by newer known items.
  const known = db ? await knownUrls(db, fetched.map((i) => i.url)) : new Set();
  const unseen = fetched.filter((i) => !known.has(i.url));
  const candidates = unseen.slice(0, MAX_ITEMS_PER_FIGHTER);
  if (unseen.length > candidates.length) {
    console.log(`${fighter.name}: capped ${unseen.length} unseen to ${candidates.length}, rest next run`);
  }
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

  const digestItems = [];   // NO_CLAIM / UNSURE items + quote-grade claims
  const rumorPosts = [];    // lifecycle claims born as rumor -> 🕵️ lines
  const ceremonies = [];    // announcements born confirmed -> standalone 🚨
  const confirmations = []; // rumor->confirmed transitions -> threaded replies
  const digestClaims = [];  // claim ids whose home message is the digest

  for (const [i, item] of candidates.entries()) {
    item.fighter = fighter.name;
    item.embedding = vectors?.[i] ?? null;
    item.embeddingModel = EMBEDDING_MODEL;

    // Compare against stored rows BEFORE inserting this one, so an item
    // never matches itself. Recorded for every item — the similarity
    // distribution is threshold-tuning data.
    const nearest = item.embedding ? await nearestRecent(db, fighter.name, item.embedding) : null;
    item.nearestSimilarity = nearest?.similarity ?? null;
    item.nearestItem = nearest?.id ?? null;

    // Gate 2: confident embedding dup -> held; inherits its neighbor's claim
    // link as an echo, no LLM needed (docs §5).
    if (nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD) {
      item.posted = false;
      item.heldReason = "embedding";
      console.log(
        `${fighter.name}: held as dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
      if (db && !DRY_RUN) {
        const itemId = await insertItem(db, item);
        const inherited = await claimOfItem(db, item.nearestItem);
        if (itemId && inherited) await linkClaimSource(db, itemId, inherited, "echo");
      }
      continue;
    }

    // Gate 3: the claim matcher (absorbs the gray-zone judge — a MATCH-as-echo
    // verdict IS the dedup decision). Fail-open: matcher trouble -> UNSURE ->
    // the item posts like it always did.
    let verdict = { verdict: "UNSURE" };
    if (db && process.env.ANTHROPIC_API_KEY) {
      try {
        const knownClaims = await activeClaims(db, fighter.name, item.embedding);
        verdict = await matchItem({ fighter: fighter.name, item, candidates: knownClaims });
      } catch (err) {
        console.warn(`${fighter.name}: matcher failed (fail-open):`, err.message);
      }
    }
    console.log(
      `${fighter.name}: matcher ${verdict.verdict}${verdict.match_claim_id ? " #" + verdict.match_claim_id : ""}: ${item.title.slice(0, 60)}`
    );

    const official = isOfficialSource(item.source);

    if (verdict.verdict === "WRONG_SUBJECT") {
      // Namesake / junk: recorded for audit, never posted, never a claim.
      item.posted = false;
      item.heldReason = "wrong_subject";
      if (db && !DRY_RUN) await insertItem(db, item);
      continue;
    }

    if (verdict.verdict === "MATCH" && verdict.match_claim_id) {
      // Same fact, another sighting: held as evidence.
      item.posted = false;
      item.heldReason = "llm";
      if (db && !DRY_RUN) {
        const itemId = await insertItem(db, item);
        if (itemId) {
          await linkClaimSource(db, itemId, verdict.match_claim_id,
            official ? "official" : "echo", verdict.stance ?? "asserts");
        }
        // Conservative lifecycle (phase 1): ONLY an official source flips
        // rumor -> confirmed. Independence counting waits for 2e bodies.
        // Official denials: logged + linked for now; auto-deny is phase 2.
        if (official && (verdict.stance ?? "asserts") === "asserts") {
          const c = await confirmClaim(db, verdict.match_claim_id);
          if (c) confirmations.push({ text: c.canonical_text, replyTo: c.tg_message_id, item });
        }
      }
      continue;
    }

    // NO_CLAIM / UNSURE / NEW from here on: the item itself gets posted.
    const nc = verdict.verdict === "NEW" ? verdict.new_claim : null;
    const isRealClaim = nc && nc.type !== "lifestyle"; // lifestyle == NO_CLAIM (docs §5)
    item.posted = true;
    const itemId = db && !DRY_RUN ? await insertItem(db, item) : null;

    if (isRealClaim) {
      const status = official || nc.sourcing === "official" ? "confirmed" : "rumor";
      let claimId = null;
      if (db && !DRY_RUN && itemId) {
        let claimVec = null;
        try { claimVec = (await embedTexts([nc.canonical_text]))?.[0] ?? null; } catch {}
        claimId = await insertClaim(db, {
          fighter: fighter.name, type: nc.type, canonicalText: nc.canonical_text,
          facts: nc.facts, status, embedding: claimVec, embeddingModel: EMBEDDING_MODEL,
        });
        await linkClaimSource(db, itemId, claimId, official ? "official" : "origin");
      }
      if (nc.type === "announcement" && status === "confirmed") {
        ceremonies.push({ claimId, text: nc.canonical_text, item });
        continue;
      }
      if (status === "rumor" && ["announcement", "result", "injury", "negotiation"].includes(nc.type)) {
        rumorPosts.push({ claimId, text: nc.canonical_text, item });
        continue;
      }
      if (claimId) digestClaims.push(claimId); // quotes etc. ride the digest
    }
    digestItems.push(item);
  }

  const postedCount = ceremonies.length + rumorPosts.length + digestItems.length;
  console.log(
    `${fighter.name}: ${fetched.length} fetched, ${candidates.length} unseen, ${postedCount} posted, ${confirmations.length} confirmation(s)`
  );

  // Translate digest headlines the group can't read (claim texts are already
  // English). Fail-open: a failed translation posts the original.
  for (const item of digestItems) {
    if (GROUP_LANGUAGES.has(item.edition)) continue;
    try {
      item.displayTitle = await translateToEnglish(cleanTitle(item));
    } catch (err) {
      console.warn(`translate failed for "${item.title.slice(0, 40)}":`, err.message);
    }
  }

  // 1. Ceremonies: one standalone post per confirmed announcement.
  for (const c of ceremonies) {
    const msg = `🚨 <b>Fight announced</b>\n\n<b>${escapeHtml(c.text)}</b>\n\n— <a href="${c.item.url}">${escapeHtml(c.item.source)}</a>`;
    if (DRY_RUN) {
      console.log(`\n--- would post (ceremony) ---\n${msg}\n`);
    } else {
      const mid = await sendTelegramMessage(CHAT_ID, msg, { html: true, noPreview: true });
      if (db && c.claimId) await setClaimMessageId(db, c.claimId, mid);
    }
  }

  // 2. The digest: rumor lines first, then regular items.
  const lines = [
    ...rumorPosts.map(
      (r) => `🕵️ <b>Rumor:</b> ${escapeHtml(r.text)} — <a href="${r.item.url}">${escapeHtml(r.item.source)}</a>, ${hoursAgo(r.item.publishedAt)}h ago`
    ),
    ...digestItems.map(digestLine),
  ];
  if (lines.length > 0) {
    const message = `🔎 <b>${escapeHtml(fighter.name)}</b>\n\n${lines.join("\n\n")}`;
    if (DRY_RUN) {
      console.log(`\n--- would post ---\n${message}\n`);
    } else {
      const mid = await sendTelegramMessage(CHAT_ID, message, { html: true, noPreview: true });
      if (db && mid) {
        for (const r of rumorPosts) if (r.claimId) await setClaimMessageId(db, r.claimId, mid);
        for (const cid of digestClaims) await setClaimMessageId(db, cid, mid);
      }
    }
  }

  // 3. Confirmations: threaded replies to the original rumor post.
  for (const c of confirmations) {
    const msg = `✅ <b>Confirmed</b> — ${escapeHtml(c.text)}\n<a href="${c.item.url}">${escapeHtml(c.item.source)}</a>`;
    if (DRY_RUN) {
      console.log(`\n--- would post (confirmation) ---\n${msg}\n`);
    } else {
      await sendTelegramMessage(CHAT_ID, msg, { html: true, noPreview: true, replyTo: c.replyTo });
    }
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

main().catch(async (err) => {
  console.error(err);
  // Self-report to the admin's DM, best-effort: if Telegram itself is what
  // broke, this can't deliver — the GCP failure alert is the backstop.
  if (ADMIN_CHAT_ID && !DRY_RUN) {
    try {
      await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Hunter run failed: ${err.message}`);
    } catch {}
  }
  process.exit(1);
});
