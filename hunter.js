// The RingFacts hunter.
// Each run: fetch Google News RSS per subject -> drop URLs already in the DB
// -> embed the rest -> hold back semantic duplicates (same story, different
// outlet/language) -> post what's genuinely new -> record everything.
//
// Degradation ladder: no DATABASE_URL -> no dedup (local dry runs);
// embedding API down -> URL dedup only. DB configured but unreachable is
// fatal — posting without memory would re-spam the group.
//
// DRY_RUN=1 prints instead of posting and skips DB writes (reads still work).

import { sendTelegramMessage, escapeHtml } from "./lib/telegram.js";
import { openDb } from "./lib/db.js";
// The namespace IS the test seam: `deps.store` swaps every database call at
// once. History: docs/decisions.md#deps-seam
import * as realStore from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";
import { translateToEnglish } from "./lib/translate.js";
import { matchItem } from "./lib/matcher.js";
import { isOfficialSource } from "./lib/sources.js";
import { OUTLETS, fetchOutletItems, matchesSubject } from "./lib/feeds.js";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "./lib/googlenews.js";
import { fetchArticleBody, decodeEntities } from "./lib/extract.js";
import { loadSubjects } from "./lib/subjects.js";
import { digestTierFor } from "./lib/tier.js";
import { readChatIds } from "./lib/chat-ids.js";
import { domain } from "./domain/index.js";
import { fileURLToPath } from "node:url";

// Editions the group reads as-is; anything else is translated at posting time
// and labeled. History: docs/decisions.md#translation-rules
const GROUP_LANGUAGES = new Set(["en", "uk"]);

const DRY_RUN = process.env.DRY_RUN === "1";
// From the single telegram-chat-ids secret (lib/chat-ids.js explains why).
// `required: false` lets a dry or offline run import with no chat configured; a
// present-but-malformed value still throws at startup. ADMIN_CHAT_ID takes the
// failure self-reports; they never go to the group.
const { group: CHAT_ID, admin: ADMIN_CHAT_ID } = readChatIds({ required: false });
const HOURS_BACK = Number(process.env.HOURS_BACK || 24);
const MAX_ITEMS_PER_SUBJECT = 5;
// Cosine similarity above this = same story.
// History: docs/decisions.md#dup-threshold
const SEMANTIC_DUP_THRESHOLD = Number(process.env.SEMANTIC_DUP_THRESHOLD || 0.8);

// Google News RSS needs matching language/country params per edition,
// otherwise Cyrillic queries return the (empty) English edition.
const EDITIONS = {
  en: "hl=en-US&gl=US&ceid=US:en",
  uk: "hl=uk&gl=UA&ceid=UA:uk",
  es: "hl=es&gl=ES&ceid=ES:es",
};

export function feedUrl(alias) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(alias.query) +
    "&" +
    EDITIONS[alias.edition]
  );
}

// RSS is machine-generated and regular, so a regex parse is fine at this
// stage; a real XML parser can come in when we add messier sources.
export function parseRssItems(xml) {
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

// One retry after a pause rides out Google's intermittent load shedding.
// History: docs/decisions.md#retry-delay
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 75_000); // 30s proved too short for Google's waves

export async function fetchFeed(alias) {
  let res = await fetch(feedUrl(alias));
  if (!res.ok) {
    console.warn(`RSS fetch ${res.status} for ${alias.query} — retrying in ${RETRY_DELAY_MS / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    res = await fetch(feedUrl(alias));
  }
  if (!res.ok) throw new Error(`RSS fetch ${res.status} for ${alias.query} (after retry)`);
  return res.text();
}

export async function fetchFreshItems(subject, directItems = [], hoursBack = HOURS_BACK) {
  const cutoff = Date.now() - hoursBack * 3_600_000;
  const items = [];
  for (const alias of subject.aliases) {
    const found = parseRssItems(await fetchFeed(alias));
    for (const item of found) {
      item.edition = alias.edition;
      item.foundVia = `${alias.edition} ${alias.query}`;
    }
    items.push(...found);
  }
  // Direct-feed items that name this subject. Cloned: the outlet pool is
  // shared across subjects, and the pipeline stamps per-subject fields.
  items.push(...directItems.filter((i) => matchesSubject(i, subject)).map((i) => ({ ...i })));
  // Fresh only, newest first. In-run URL dedup across aliases and outlets;
  // cross-run dedup is the database's job. Deliberately no cap here.
  // History: docs/decisions.md#flood-cap-order
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

// One digest bullet: plain headline, the source name carries the link, and a
// translated headline is labeled. Every value is escaped — an unescaped "&" in
// an href makes Telegram silently reject the whole message.
// Exported for test/message.test.js; importing this module never starts a hunt.
// History: docs/decisions.md#telegram-html-escaping
export function digestLine(item) {
  const title = item.displayTitle ?? cleanTitle(item);
  const label = item.displayTitle ? ` (translated from ${item.edition})` : "";
  return `• ${escapeHtml(title)} — <a href="${escapeHtml(item.url)}">${escapeHtml(item.source)}</a>${label}, ${hoursAgo(item.publishedAt)}h ago`;
}

// The one shared line for demoted items: source links grouped by outlet,
// numbered only when an outlet has more than one story.
// History: docs/decisions.md#tangential-line
export function alsoMentioningLine(items) {
  const bySource = new Map();
  for (const item of items) {
    const name = item.source.trim() || hostOf(item.resolvedUrl ?? item.url);
    const key = name.toLowerCase();
    const url = item.resolvedUrl ?? item.url;
    if (!bySource.has(key)) bySource.set(key, { name, urls: [] });
    const outlet = bySource.get(key);
    if (!outlet.urls.includes(url)) outlet.urls.push(url);
  }
  const links = [];
  for (const { name, urls } of bySource.values()) {
    for (const [i, url] of urls.entries()) {
      const label = urls.length > 1 ? `${name} (${i + 1})` : name;
      links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    }
  }
  return `↘ Also mentioning: ${links.join(" · ")}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; }
}

// How much worse the inherited claim may fit before we refuse to inherit.
// History: docs/decisions.md#claim-drift-gap
const CLAIM_DRIFT_GAP = Number(process.env.CLAIM_DRIFT_GAP || 0.1);

// Would inheriting `claimId` be a mistake? Dup chains are transitive and can
// walk onto a foreign claim, so ask the cheaper-than-an-LLM question: does this
// headline sit far closer to some OTHER claim than the one it would join?
// History: docs/decisions.md#claim-drift-gap
async function inheritanceDrifts(deps, db, item, claimId) {
  const verdict = await deps.store.claimLinkDrifts(db, item, claimId, CLAIM_DRIFT_GAP);
  if (!verdict.drifts) return false; // false, or null = unmeasurable -> old behaviour
  console.warn(
    `${item.subject}: claim drift — not inheriting #${claimId} (${verdict.mine.similarity.toFixed(3)}); ` +
      `claim #${verdict.best.id} fits better (${verdict.best.similarity.toFixed(3)}, ` +
      `gap ${verdict.gap.toFixed(3)}): ${item.title.slice(0, 60)}`
  );
  return true;
}

// Held as a semantic duplicate: recorded for audit, never posted, and linked to
// its neighbour's claim — unless that link would drift onto a foreign claim, in
// which case the hold stands and the item stays unlinked.
// History: docs/decisions.md#claim-drift-gap
async function holdAsDup(deps, db, item, role, neighborId = item.nearestItem, reason = "embedding") {
  item.posted = false;
  item.heldReason = reason;
  if (!db || deps.dryRun) return;
  const itemId = await deps.store.insertItem(db, item);
  const inherited = await deps.store.claimOfItem(db, neighborId);
  if (!itemId || !inherited) return;
  if (await inheritanceDrifts(deps, db, item, inherited)) return;
  await deps.store.linkClaimSource(db, itemId, inherited, role);
}

// Everything this function reaches outside itself arrives through `deps`, and
// every default is the real thing — a test substitutes one piece at a time and
// production behaviour is unchanged. History: docs/decisions.md#deps-seam
export async function huntSubject(db, subject, directItems = [], overrides = {}) {
  const deps = {
    store: realStore,
    embedTexts,
    matchItem,
    fetchArticleBody,
    decodeGoogleNewsUrl,
    translate: translateToEnglish,
    sendMessage: sendTelegramMessage,
    dryRun: DRY_RUN,
    chatId: CHAT_ID,
    hoursBack: HOURS_BACK,
    // A missing key means no matcher — same fail-open path as a matcher error,
    // and the reason the dup gate is re-applied to official items further down.
    matcherEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    ...overrides,
  };
  const fetched = await fetchFreshItems(subject, directItems, deps.hoursBack);

  // Gate 1: exact URLs we already know. The flood cap applies to unseen items
  // only. History: docs/decisions.md#flood-cap-order
  const known = db ? await deps.store.knownUrls(db, fetched.map((i) => i.url)) : new Set();
  const unseen = fetched.filter((i) => !known.has(i.url));
  const candidates = unseen.slice(0, MAX_ITEMS_PER_SUBJECT);
  if (unseen.length > candidates.length) {
    console.log(`${subject.name}: capped ${unseen.length} unseen to ${candidates.length}, rest next run`);
  }
  // Items an earlier run stored but could not deliver, fetched above the
  // nothing-new return so a quiet hour still carries them. Read even under
  // DRY_RUN (a dry run previews the carry; nothing is written back).
  // History: docs/decisions.md#resend-pass
  const resends = db ? await deps.store.pendingResends(db, subject.name, HOURS_BACK) : [];

  if (candidates.length === 0 && resends.length === 0) {
    console.log(`${subject.name}: ${fetched.length} fetched, nothing new`);
    return;
  }

  // Gate 2: semantic duplicates. Embedding failure degrades to URL-only dedup.
  let vectors = null;
  if (db) {
    try {
      vectors = await deps.embedTexts(candidates.map((i) => i.title));
    } catch (err) {
      console.warn(`${subject.name}: embedding failed, URL dedup only:`, err.message);
    }
  }

  const digestItems = [];   // NO_CLAIM / UNSURE items + quote-grade claims
  const rumorPosts = [];    // lifecycle claims born as rumor -> 🕵️ lines
  const ceremonies = [];    // announcements born confirmed -> standalone 🚨
  const confirmations = []; // rumor->confirmed transitions -> threaded replies
  const digestClaims = [];  // claim ids whose home message is the digest
  const tangential = [];    // demoted: one shared "also mentioning" line, not a bullet

  for (const [i, item] of candidates.entries()) {
    item.subject = subject.name;
    item.embedding = vectors?.[i] ?? null;
    item.embeddingModel = EMBEDDING_MODEL;

    // Compare against stored rows BEFORE inserting this one, so an item
    // never matches itself. Recorded for every item — the similarity
    // distribution is threshold-tuning data.
    const nearest = item.embedding ? await deps.store.nearestRecent(db, subject.name, item.embedding) : null;
    item.nearestSimilarity = nearest?.similarity ?? null;
    item.nearestItem = nearest?.id ?? null;

    const official = isOfficialSource(item.source);
    const dup = Boolean(nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD);

    // Gate 2: confident embedding dup -> held, inheriting its neighbour's
    // claim link as an echo, no LLM needed. Official sources are exempt (an
    // official confirmation is near-identical to the rumor it confirms, and
    // holding it would swallow the rumor -> confirmed transition), but the
    // exemption is a deferral, not a waiver — see the re-apply below.
    // History: docs/decisions.md#official-exemption
    if (dup && !official) {
      console.log(
        `${subject.name}: held as dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
      await holdAsDup(deps, db, item, "echo");
      continue;
    }

    // Body step, only for items past the free gates: decode Google's wrapper,
    // catch the cross-source duplicate the real URL reveals, then fetch and
    // extract the article. All of it is a bonus — any failure leaves the item
    // headline-only.
    try {
      const resolved = await deps.decodeGoogleNewsUrl(item.url);
      item.resolvedUrl = resolved ?? null; // null = wrapped URL we couldn't open
      if (resolved && resolved !== item.url && db) {
        const dupId = await deps.store.itemIdByUrl(db, resolved);
        if (dupId) {
          console.log(`${subject.name}: held as url dup (decoded to stored item #${dupId}): ${item.title.slice(0, 60)}`);
          await holdAsDup(deps, db, item, "echo", dupId, "url");
          continue;
        }
      }
      if (item.resolvedUrl || item.feedContent) {
        const r = await deps.fetchArticleBody(item.resolvedUrl, { feedContent: item.feedContent });
        item.body = r.body;
        item.bodyFetchedAt = r.fetchedAt ?? null;
        item.bodyVia = r.via;
        console.log(
          `${subject.name}: body ${r.body ? `${r.body.length} chars via ${r.via}` : `none (${r.via})`}: ${item.title.slice(0, 50)}`
        );
      } else {
        // Google's wrapper didn't decode and there's no feed body to fall
        // back on — fetchArticleBody was never even called. Distinct from a
        // null body_via on a pre-migration row.
        item.bodyVia = "decode-failed";
      }
    } catch (err) {
      console.warn(`${subject.name}: body step failed (headline-only):`, err.message);
      item.bodyVia ??= "step-error";
    }

    // Gate 3: the claim matcher (absorbs the gray-zone judge — a MATCH-as-echo
    // verdict IS the dedup decision). Fail-open: matcher trouble -> UNSURE ->
    // the item posts like it always did.
    let verdict = { verdict: "UNSURE" };
    if (db && deps.matcherEnabled) {
      try {
        const knownClaims = await deps.store.activeClaims(db, subject.name, item.embedding);
        verdict = await deps.matchItem({
          subject: subject.name, item, candidates: knownClaims,
          confusables: subject.confusables,
        });
      } catch (err) {
        console.warn(`${subject.name}: matcher failed (fail-open):`, err.message);
      }
    }
    console.log(
      `${subject.name}: matcher ${verdict.verdict}${verdict.match_claim_id ? " #" + verdict.match_claim_id : ""}: ${item.title.slice(0, 60)}`
    );
    // Recorded on every matcher-seen item before any branch returns, so the
    // archive stays re-measurable. Null means we never got an answer.
    item.subjectRole = verdict.subject_role ?? null;

    if (verdict.verdict === "WRONG_SUBJECT") {
      // Namesake / junk: recorded for audit, never posted, never a claim.
      item.posted = false;
      item.heldReason = "wrong_subject";
      if (db && !deps.dryRun) await deps.store.insertItem(db, item);
      continue;
    }

    if (verdict.verdict === "MATCH" && verdict.match_claim_id) {
      // Same fact, another sighting: held as evidence.
      item.posted = false;
      item.heldReason = "llm";
      if (db && !deps.dryRun) {
        const itemId = await deps.store.insertItem(db, item);
        if (itemId) {
          await deps.store.linkClaimSource(db, itemId, verdict.match_claim_id,
            official ? "official" : "echo", verdict.stance ?? "asserts");
        }
        // Conservative lifecycle: only an official source that asserts flips
        // rumor -> confirmed. Denials are linked as evidence, never acted on.
        if (official && (verdict.stance ?? "asserts") === "asserts") {
          const c = await deps.store.confirmClaim(db, verdict.match_claim_id);
          if (c) confirmations.push({ text: c.canonical_text, replyTo: c.tg_message_id, item });
        }
      }
      continue;
    }

    // Gate 2, re-applied: on UNSURE / NO_CLAIM there is no claim to act on, so
    // the reason to skip the dup gate is gone and the gate stands.
    // History: docs/decisions.md#official-exemption
    if (official && dup && ["UNSURE", "NO_CLAIM"].includes(verdict.verdict)) {
      console.log(
        `${subject.name}: matcher ${verdict.verdict}, holding official dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
      );
      await holdAsDup(deps, db, item, "official");
      continue;
    }

    // NO_CLAIM / UNSURE / NEW from here on: the item itself gets posted.
    const nc = verdict.verdict === "NEW" ? verdict.new_claim : null;
    const isRealClaim = nc && !domain.ignoredTypes.includes(nc.type); // docs §5

    // Digest tier (lib/tier.js): is this article ABOUT the subject, or does it
    // merely sit next to news about them? The matcher's role judgement leads;
    // the mention-count rule is the fallback. Keyed on isRealClaim, not claimId.
    // History: docs/decisions.md#tier-keying
    item.digestTier = isRealClaim ? "main" : digestTierFor(item, subject.matchNames, item.subjectRole);
    item.posted = true;
    const itemId = db && !deps.dryRun ? await deps.store.insertItem(db, item) : null;
    item.dbId = itemId;

    if (isRealClaim) {
      const status = official || nc.sourcing === "official" ? "confirmed" : "rumor";
      let claimId = null;
      if (db && !deps.dryRun && itemId) {
        let claimVec = null;
        try { claimVec = (await deps.embedTexts([nc.canonical_text]))?.[0] ?? null; } catch {}
        claimId = await deps.store.insertClaim(db, {
          subject: subject.name, type: nc.type, canonicalText: nc.canonical_text,
          facts: nc.facts, status, embedding: claimVec, embeddingModel: EMBEDDING_MODEL,
        });
        await deps.store.linkClaimSource(db, itemId, claimId, official ? "official" : "origin");
      }
      if (nc.type === domain.ceremonyType && status === "confirmed") {
        ceremonies.push({ claimId, text: nc.canonical_text, item });
        continue;
      }
      if (status === "rumor" && domain.loudTypes.includes(nc.type)) {
        rumorPosts.push({ claimId, text: nc.canonical_text, item });
        continue;
      }
      if (claimId) digestClaims.push(claimId); // quotes etc. ride the digest
    }
    (item.digestTier === "tangential" ? tangential : digestItems).push(item);
  }

  const postedCount = ceremonies.length + rumorPosts.length + digestItems.length + tangential.length;
  console.log(
    `${subject.name}: ${fetched.length} fetched, ${candidates.length} unseen, ${postedCount} posted ` +
      `(${tangential.length} tangential), ${confirmations.length} confirmation(s)`
  );

  // Resend pass: items an earlier run stored but could not deliver ride this
  // run's digest as ordinary bullets, rebuilt from the row and deliberately
  // not re-judged. History: docs/decisions.md#resend-pass
  for (const row of resends) {
    const item = {
      dbId: row.id, title: row.title, source: row.source ?? "",
      url: row.resolved_url ?? row.url, publishedAt: new Date(row.published_at),
      edition: row.edition, resent: true,
    };
    (row.digest_tier === "tangential" ? tangential : digestItems).push(item);
  }
  if (resends.length) {
    console.log(`${subject.name}: carrying ${resends.length} item(s) from a failed send`);
  }

  // Translate digest headlines the group can't read (claim texts are already
  // English). Tangential items are excluded, a null-edition resend posts as
  // filed, and a failed translation posts the original.
  // History: docs/decisions.md#translation-rules
  for (const item of digestItems) {
    if (item.resent && !item.edition) continue;
    if (GROUP_LANGUAGES.has(item.edition)) continue;
    try {
      item.displayTitle = await deps.translate(cleanTitle(item));
    } catch (err) {
      console.warn(`translate failed for "${item.title.slice(0, 40)}":`, err.message);
    }
  }

  // Rows are written posted=true before any send, so a failed send must walk
  // them back — or the archive asserts the group saw something it never did.
  // History: docs/decisions.md#send-failure-walkback
  const sendFailed = async (items, what) => {
    const ids = items.map((i) => i.dbId).filter(Boolean);
    console.error(`${subject.name}: ${what} send failed — ${ids.length} item(s) marked unposted`);
    if (db && !deps.dryRun && ids.length) {
      await deps.store.markUnposted(db, ids, "send_failed");
    }
  };

  // 1. Ceremonies: one standalone post per confirmed announcement.
  for (const c of ceremonies) {
    const msg = `🚨 <b>${escapeHtml(domain.ceremonyLabel)}</b>\n\n<b>${escapeHtml(c.text)}</b>\n\n— <a href="${escapeHtml(c.item.url)}">${escapeHtml(c.item.source)}</a>`;
    if (deps.dryRun) {
      console.log(`\n--- would post (ceremony) ---\n${msg}\n`);
    } else {
      const mid = await deps.sendMessage(deps.chatId, msg, { html: true, noPreview: true });
      if (db && c.claimId) await deps.store.setClaimMessageId(db, c.claimId, mid);
      if (!mid) await sendFailed([c.item], "ceremony");
    }
  }

  // 2. The digest: rumor lines first, then regular items, then one shared line
  // for the tangential — attached only when there is a real line above it.
  const lines = [
    ...rumorPosts.map(
      (r) => `🕵️ <b>Rumor:</b> ${escapeHtml(r.text)} — <a href="${escapeHtml(r.item.url)}">${escapeHtml(r.item.source)}</a>, ${hoursAgo(r.item.publishedAt)}h ago`
    ),
    ...digestItems.map(digestLine),
  ];
  if (tangential.length > 0 && lines.length > 0) lines.push(alsoMentioningLine(tangential));
  if (lines.length > 0) {
    const message = `🔎 <b>${escapeHtml(subject.name)}</b>\n\n${lines.join("\n\n")}`;
    if (deps.dryRun) {
      console.log(`\n--- would post ---\n${message}\n`);
    } else {
      const mid = await deps.sendMessage(deps.chatId, message, { html: true, noPreview: true });
      if (db && mid) {
        for (const r of rumorPosts) if (r.claimId) await deps.store.setClaimMessageId(db, r.claimId, mid);
        for (const cid of digestClaims) await deps.store.setClaimMessageId(db, cid, mid);
        // Delivered at last: the rows that were carrying 'send_failed' go back
        // to saying the group has seen them.
        const recovered = [...digestItems, ...tangential].filter((i) => i.resent).map((i) => i.dbId);
        if (recovered.length) {
          await deps.store.markPosted(db, recovered);
          console.log(`${subject.name}: ${recovered.length} recovered item(s) delivered`);
        }
      }
      // One message carries every line, so one failure loses all of them. The
      // claims stay: a claim is a fact we learned, not a message we sent.
      if (!mid) await sendFailed([...rumorPosts.map((r) => r.item), ...digestItems, ...tangential], "digest");
    }
  } else if (tangential.length > 0) {
    // Every posted item this run was tangential — a header plus an "also
    // mentioning" line is exactly the noise this rule removes, so nothing is
    // sent, and the rows already written posted=true are corrected.
    // History: docs/decisions.md#send-failure-walkback
    console.log(`${subject.name}: ${tangential.length} tangential item(s) only — nothing broadcast`);
    if (db && !deps.dryRun) {
      await deps.store.markUnposted(db, tangential.map((i) => i.dbId).filter(Boolean), "tangential");
    }
  }

  // 3. Confirmations: threaded replies to the original rumor post.
  for (const c of confirmations) {
    const msg = `✅ <b>Confirmed</b> — ${escapeHtml(c.text)}\n<a href="${escapeHtml(c.item.url)}">${escapeHtml(c.item.source)}</a>`;
    if (deps.dryRun) {
      console.log(`\n--- would post (confirmation) ---\n${msg}\n`);
    } else {
      await deps.sendMessage(deps.chatId, msg, { html: true, noPreview: true, replyTo: c.replyTo });
    }
  }
}

async function main() {
  if (!DRY_RUN && !CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_IDS is required unless DRY_RUN=1");
  }
  // Before the database and the feeds: a missing watchlist is a config error,
  // and there is no point opening connections to discover it.
  const subjects = await loadSubjects();
  // No DATABASE_URL (secret-free local run) -> no dedup. But if a DB is
  // configured and unreachable, fail the whole run: memory-less posting
  // would re-spam the group every hour.
  const db = process.env.DATABASE_URL ? await openDb() : null;
  if (!db) console.warn("No DATABASE_URL — running without dedup memory.");

  // Direct publisher feeds: one fetch per outlet per run, shared across
  // subjects. A dead outlet is a warning, never a failed run — and if Google
  // 503s a whole run, these still deliver.
  const directItems = [];
  const outletResults = await Promise.allSettled(OUTLETS.map((o) => fetchOutletItems(o)));
  outletResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      directItems.push(...r.value);
      // Outlet feeds are name-filtered before anything is stored, so a rotted
      // matchNames stem would look exactly like quiet news; these counts are
      // the evidence that separates the two.
      // History: docs/decisions.md#outlet-match-counters
      const matched = r.value.filter((it) => subjects.some((s) => matchesSubject(it, s))).length;
      console.log(
        `direct feed ${OUTLETS[i].id}: ${r.value.length} items, ${matched} matched, ${r.value.length - matched} discarded`,
      );
    } else {
      console.warn(`direct feed ${OUTLETS[i].id} failed:`, r.reason.message);
    }
  });

  try {
    let failures = 0;
    for (const subject of subjects) {
      try {
        await huntSubject(db, subject, directItems);
      } catch (err) {
        // One broken feed must not kill the other subjects' hunts.
        failures++;
        console.error(`${subject.name}: hunt failed:`, err);
      }
    }
    if (failures === subjects.length) {
      throw new Error("every subject hunt failed"); // job run shows red
    }
  } finally {
    if (db) await db.end();
  }
}

// Run a hunt only when executed directly (`node hunter.js`), so tests and
// scripts can import from this module without starting one.
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
