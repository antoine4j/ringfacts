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
  openDb, knownUrls, nearestRecent, insertItem, itemIdByUrl,
  activeClaims, insertClaim, linkClaimSource, claimOfItem, setClaimMessageId, confirmClaim,
  claimLinkDrifts, markUnposted,
} from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";
import { translateToEnglish } from "./lib/translate.js";
import { matchItem } from "./lib/matcher.js";
import { isOfficialSource } from "./lib/sources.js";
import { OUTLETS, fetchOutletItems, matchesFighter } from "./lib/feeds.js";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "./lib/googlenews.js";
import { fetchArticleBody, decodeEntities } from "./lib/extract.js";
import { FIGHTERS } from "./lib/fighters.js";
import { isTangential } from "./lib/tier.js";
import { fileURLToPath } from "node:url";

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

async function fetchFreshItems(fighter, directItems = []) {
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
  // Direct-feed items that name this fighter (2e). Cloned: the outlet pool is
  // shared across fighters, and the pipeline stamps per-fighter fields.
  items.push(...directItems.filter((i) => matchesFighter(i, fighter)).map((i) => ({ ...i })));
  // Fresh only, newest first. In-run URL dedup across aliases and outlets;
  // cross-run dedup is the database's job. NOTE: no cap here — capping before
  // the known-URL check would let newer known items permanently shadow older
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
// presented as the original. The href is escaped: both parsers decode HTML
// entities into the URL (hunter.js pick(), feeds.js), so a WordPress feed's
// "?utm_source=rss&utm_medium=rss" reaches here with a bare "&" — Telegram's
// HTML mode rejects that and sendTelegramMessage fails the WHOLE message
// silently, even though every item in it is already stored posted=true.
// Exported (only these three) so the message-formatting logic — dedup,
// escaping — is directly checkable without running main(), which this module
// does unconditionally on import.
export function digestLine(item) {
  const title = item.displayTitle ?? cleanTitle(item);
  const label = item.displayTitle ? ` (translated from ${item.edition})` : "";
  return `• ${escapeHtml(title)} — <a href="${escapeHtml(item.url)}">${escapeHtml(item.source)}</a>${label}, ${hoursAgo(item.publishedAt)}h ago`;
}

// Tangential items: stored and linked, but not worth a headline. One link per
// outlet — candidates arrive newest-first (fetchFreshItems sorts at :121), so
// the first item seen for a given source is its newest. Falls back to the URL
// hostname when source is empty (parseRssItems can return "" for a missing
// <source> tag), which would otherwise render an invisible zero-width link.
export function alsoMentioningLine(items) {
  const bySource = new Map();
  for (const item of items) {
    const name = item.source.trim() || hostOf(item.resolvedUrl ?? item.url);
    const key = name.toLowerCase();
    if (!bySource.has(key)) bySource.set(key, { name, url: item.resolvedUrl ?? item.url });
  }
  const links = [...bySource.values()].map(
    (s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`
  );
  return `↘ Also mentioning: ${links.join(" · ")}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; }
}

// How much worse the inherited claim may fit before we refuse to inherit.
// Measured 2026-08-08 over all 28 live links: the links that had drifted onto
// a foreign claim sat 0.107-0.214 below the item's best-fitting claim, while
// links that were right but looked wrong (claim 4, whose garbled canonical
// text under-scores its own evidence) sat 0.076-0.082 below. 0.10 splits the
// observed gap — same way the 0.80 dup threshold was picked.
const CLAIM_DRIFT_GAP = Number(process.env.CLAIM_DRIFT_GAP || 0.1);

// Would inheriting `claimId` be a mistake? Dup-gate inheritance is transitive:
// B is held against A and takes A's claim, then C is held against B and takes
// it too. Every hop clears 0.80 against the PREVIOUS headline, so the chain can
// walk somewhere its starting claim never was — observed live, where a story
// about Fighter C's manager blasting Ali Abdelaziz rode a 0.802 -> 0.869 -> 0.974
// chain onto an unrelated matchmaking claim. We can't re-read the article
// without an LLM call, but we can ask the cheaper question: does this headline
// sit far closer to some OTHER claim than to the one it is about to join?
async function inheritanceDrifts(db, item, claimId) {
  const verdict = await claimLinkDrifts(db, item, claimId, CLAIM_DRIFT_GAP);
  if (!verdict.drifts) return false; // false, or null = unmeasurable -> old behaviour
  console.warn(
    `${item.fighter}: claim drift — not inheriting #${claimId} (${verdict.mine.similarity.toFixed(3)}); ` +
      `claim #${verdict.best.id} fits better (${verdict.best.similarity.toFixed(3)}, ` +
      `gap ${verdict.gap.toFixed(3)}): ${item.title.slice(0, 60)}`
  );
  return true;
}

// Held as a semantic duplicate: recorded for audit, never posted, and linked
// to whatever claim its nearest neighbor already supports — held dups inherit
// the claim link instead of paying for extraction (docs §5).
//
// A drifted link is worse than no link: claim_sources rows are what phase 2
// counts for corroboration and what a confirmation ceremony lists as evidence,
// so a foreign article credited here becomes a wrong statement to the group
// later. On drift we keep the hold (the item still never posts — nothing the
// group sees changes) and leave it unlinked, which is already a recognised
// state: audit-swallowed-confirmations.js calls unlinked held items
// "reconciler candidates".
async function holdAsDup(db, item, role, neighborId = item.nearestItem, reason = "embedding") {
  item.posted = false;
  item.heldReason = reason;
  if (!db || DRY_RUN) return;
  const itemId = await insertItem(db, item);
  const inherited = await claimOfItem(db, neighborId);
  if (!itemId || !inherited) return;
  if (await inheritanceDrifts(db, item, inherited)) return;
  await linkClaimSource(db, itemId, inherited, role);
}

async function huntFighter(db, fighter, directItems = []) {
  const fetched = await fetchFreshItems(fighter, directItems);

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
  const tangential = [];    // demoted: one shared "also mentioning" line, not a bullet

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

    const official = isOfficialSource(item.source);
    const dup = Boolean(nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD);

    // Gate 2: confident embedding dup -> held; inherits its neighbor's claim
    // link as an echo, no LLM needed (docs §5).
    //
    // Official sources are exempt, because this gate is most likely to fire
    // exactly when it must not: an official confirmation headline is BY
    // CONSTRUCTION near-identical to the rumor it confirms, so holding it
    // here would swallow the rumor -> confirmed transition (docs §6) — the
    // one edge the claims layer exists to catch. Official items go to the
    // matcher instead, so the confirm decision rests on read meaning rather
    // than on 0.80 cosine; the loudest thing the bot does earns the LLM call.
    // The exemption is a deferral, not a waiver — see the re-apply below.
    if (dup && !official) {
      console.log(
        `${fighter.name}: held as dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
      await holdAsDup(db, item, "echo");
      continue;
    }

    // Body step (2e), only for items that made it past the free gates — held
    // dups and known URLs never cost network. Decode Google's wrapper to the
    // real URL, catch the cross-source duplicate that reveals (a story we
    // already stored from a direct feed), then fetch + extract the article.
    // Everything here is a bonus: any failure leaves the item headline-only,
    // which is exactly yesterday's pipeline.
    try {
      const resolved = await decodeGoogleNewsUrl(item.url);
      item.resolvedUrl = resolved ?? null; // null = wrapped URL we couldn't open
      if (resolved && resolved !== item.url && db) {
        const dupId = await itemIdByUrl(db, resolved);
        if (dupId) {
          console.log(`${fighter.name}: held as url dup (decoded to stored item #${dupId}): ${item.title.slice(0, 60)}`);
          await holdAsDup(db, item, "echo", dupId, "url");
          continue;
        }
      }
      if (item.resolvedUrl || item.feedContent) {
        const r = await fetchArticleBody(item.resolvedUrl, { feedContent: item.feedContent });
        item.body = r.body;
        item.bodyFetchedAt = r.fetchedAt ?? null;
        item.bodyVia = r.via;
        console.log(
          `${fighter.name}: body ${r.body ? `${r.body.length} chars via ${r.via}` : `none (${r.via})`}: ${item.title.slice(0, 50)}`
        );
      } else {
        // Google's wrapper didn't decode and there's no feed body to fall
        // back on — fetchArticleBody was never even called. Distinct from a
        // null body_via on a pre-migration row.
        item.bodyVia = "decode-failed";
      }
    } catch (err) {
      console.warn(`${fighter.name}: body step failed (headline-only):`, err.message);
      item.bodyVia ??= "step-error";
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

    // Gate 2, re-applied. The official exemption above bought this item a
    // matcher call so it could reach MATCH (-> confirm, already returned) or
    // NEW (-> born-confirmed claim, handled below). On UNSURE / NO_CLAIM
    // there is no claim to act on, so the reason to skip the dup gate is
    // gone and the gate stands — otherwise a matcher outage (fail-open
    // UNSURE, missing API key) turns every official echo into a duplicate post.
    if (official && dup && ["UNSURE", "NO_CLAIM"].includes(verdict.verdict)) {
      console.log(
        `${fighter.name}: matcher ${verdict.verdict}, holding official dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
      await holdAsDup(db, item, "official");
      continue;
    }

    // NO_CLAIM / UNSURE / NEW from here on: the item itself gets posted.
    const nc = verdict.verdict === "NEW" ? verdict.new_claim : null;
    const isRealClaim = nc && nc.type !== "lifestyle"; // lifestyle == NO_CLAIM (docs §5)

    // Digest tier (TODO step 4, thresholds measured in audit-digest-tier.js):
    // an article that never names the fighter in its headline and names them
    // at most once in a body long enough to judge is ABOUT someone else. It
    // still posts — as a source link on one shared line, not as a headline.
    // Claim sources are exempt by construction: whatever fed a claim earns
    // its own line. Keyed on isRealClaim, not claimId — claimId is null under
    // DRY_RUN and with no db, and this must demote identically either way.
    item.digestTier = !isRealClaim && isTangential(item, fighter.matchNames) ? "tangential" : "main";
    item.posted = true;
    const itemId = db && !DRY_RUN ? await insertItem(db, item) : null;
    item.dbId = itemId;

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
    (item.digestTier === "tangential" ? tangential : digestItems).push(item);
  }

  const postedCount = ceremonies.length + rumorPosts.length + digestItems.length + tangential.length;
  console.log(
    `${fighter.name}: ${fetched.length} fetched, ${candidates.length} unseen, ${postedCount} posted ` +
      `(${tangential.length} tangential), ${confirmations.length} confirmation(s)`
  );

  // Translate digest headlines the group can't read (claim texts are already
  // English). Tangential items are deliberately excluded — the "also
  // mentioning" line shows only source names, so translating their headlines
  // would be a wasted Gemini call. Fail-open: a failed translation posts the
  // original.
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
    const msg = `🚨 <b>Fight announced</b>\n\n<b>${escapeHtml(c.text)}</b>\n\n— <a href="${escapeHtml(c.item.url)}">${escapeHtml(c.item.source)}</a>`;
    if (DRY_RUN) {
      console.log(`\n--- would post (ceremony) ---\n${msg}\n`);
    } else {
      const mid = await sendTelegramMessage(CHAT_ID, msg, { html: true, noPreview: true });
      if (db && c.claimId) await setClaimMessageId(db, c.claimId, mid);
    }
  }

  // 2. The digest: rumor lines first, then regular items, then one shared
  // line for everything demoted as tangential. Attached only when there's a
  // real line to attach it to — see the suppression branch below for when
  // tangential items are the ONLY thing a run produced.
  const lines = [
    ...rumorPosts.map(
      (r) => `🕵️ <b>Rumor:</b> ${escapeHtml(r.text)} — <a href="${escapeHtml(r.item.url)}">${escapeHtml(r.item.source)}</a>, ${hoursAgo(r.item.publishedAt)}h ago`
    ),
    ...digestItems.map(digestLine),
  ];
  if (tangential.length > 0 && lines.length > 0) lines.push(alsoMentioningLine(tangential));
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
  } else if (tangential.length > 0) {
    // Every posted item this run was tangential — a message with nothing but
    // a header and an "also mentioning" line is exactly the noise this rule
    // exists to remove, so nothing is sent. But these rows were already
    // written with posted=true (set before we knew the run's total shape),
    // and audit-digest-tier.js partitions the archive on that column when
    // re-measuring thresholds — so correct it, or the next measurement reads
    // items as broadcast that never were.
    console.log(`${fighter.name}: ${tangential.length} tangential item(s) only — nothing broadcast`);
    if (db && !DRY_RUN) {
      await markUnposted(db, tangential.map((i) => i.dbId).filter(Boolean), "tangential");
    }
  }

  // 3. Confirmations: threaded replies to the original rumor post.
  for (const c of confirmations) {
    const msg = `✅ <b>Confirmed</b> — ${escapeHtml(c.text)}\n<a href="${escapeHtml(c.item.url)}">${escapeHtml(c.item.source)}</a>`;
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

  // Direct publisher feeds (2e): one fetch per outlet per run, shared across
  // fighters. A dead outlet is a warning, never a failed run — and if Google
  // 503s a whole run, these still deliver (the documented escalation path).
  const directItems = [];
  const outletResults = await Promise.allSettled(OUTLETS.map((o) => fetchOutletItems(o)));
  outletResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      directItems.push(...r.value);
      console.log(`direct feed ${OUTLETS[i].id}: ${r.value.length} items`);
    } else {
      console.warn(`direct feed ${OUTLETS[i].id} failed:`, r.reason.message);
    }
  });

  try {
    let failures = 0;
    for (const fighter of FIGHTERS) {
      try {
        await huntFighter(db, fighter, directItems);
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

// Guarded so a script can `import { digestLine, alsoMentioningLine } from
// "./hunter.js"` — e.g. to check message formatting directly — without
// triggering a live hunt. `node hunter.js` (local runs, the Cloud Run job)
// is unaffected: argv[1] equals this file's path in that case.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
}
