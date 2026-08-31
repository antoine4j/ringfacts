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
import { decodeGoogleNewsUrl } from "./lib/googlenews.js";
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

/**
 * Builds the Google News RSS search URL for one alias.
 *
 * @param {object} alias  `{ query, edition }` from the subject's watchlist.
 * @returns {string}
 */
export function feedUrl(alias) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(alias.query) +
    "&" +
    EDITIONS[alias.edition]
  );
}

/**
 * Parses a Google News RSS document into plain item objects.
 * RSS is machine-generated and regular, so a regex parse is fine at this
 * stage; a real XML parser can come in when we add messier sources.
 *
 * @param {string} xml  The raw RSS body.
 * @returns {object[]}  `{ title, url, source, rssDescription, publishedAt }` per item.
 */
export function parseRssItems(xml) {
  const items = [];

  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    // One tag's inner text, entity-decoded; a missing tag yields "".
    const pick = (tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return decodeEntities(match?.[1] ?? "");
    };

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

// One retry after a pause rides out Google's intermittent load shedding.
// History: docs/decisions.md#retry-delay
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 75_000);

/**
 * Fetches one alias's RSS feed, retrying once after a pause on a bad status.
 *
 * @param {object} alias  `{ query, edition }`.
 * @returns {Promise<string>}  The RSS body.
 */
export async function fetchFeed(alias) {
  let res = await fetch(feedUrl(alias));

  // One retry, then give up loudly.
  if (!res.ok) {
    console.warn(`RSS fetch ${res.status} for ${alias.query} — retrying in ${RETRY_DELAY_MS / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    res = await fetch(feedUrl(alias));
  }
  if (!res.ok) throw new Error(`RSS fetch ${res.status} for ${alias.query} (after retry)`);

  return res.text();
}

/**
 * Gathers every fresh item for one subject: all its Google News aliases plus
 * the direct publisher feeds, newest first, each URL kept once.
 *
 * @param {object} subject      One watchlist subject.
 * @param {object[]} directItems  The shared per-run pool from the outlet feeds.
 * @param {number} hoursBack    Freshness window in hours.
 * @returns {Promise<object[]>}
 */
export async function fetchFreshItems(subject, directItems = [], hoursBack = HOURS_BACK) {
  const cutoff = Date.now() - hoursBack * 3_600_000;

  // Google News, one fetch per alias, each item stamped with where it was found.
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
  for (const item of directItems) {
    if (matchesSubject(item, subject)) items.push({ ...item });
  }

  // Fresh only. Cross-run dedup is the database's job, and there is
  // deliberately no cap here. History: docs/decisions.md#flood-cap-order
  const fresh = items.filter((item) => item.publishedAt.getTime() > cutoff);

  // Newest first.
  fresh.sort((a, b) => b.publishedAt - a.publishedAt);

  // In-run URL dedup across aliases and outlets: the first sighting wins.
  const seenUrls = new Set();
  const unique = [];
  for (const item of fresh) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    unique.push(item);
  }
  return unique;
}

/**
 * Assembles the dependency set a hunt runs on. Every default is the real
 * implementation, so a test substitutes one piece at a time and production
 * behaviour is unchanged.
 *
 * @param {object} overrides  Test replacements, merged over the defaults.
 * @returns {object}  The seam every stage reaches outside itself through.
 *
 * History: docs/decisions.md#deps-seam
 */
function buildDeps(overrides) {
  return {
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
    // and the reason the dup gate is re-applied to official items later.
    matcherEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    ...overrides,
  };
}

/**
 * Runs the whole pipeline for one subject: discover, dedup, classify, record,
 * and deliver. The stages below appear in the file in the order they run here.
 *
 * @param {object|null} db      Open database, or null for a memory-less run.
 * @param {object} subject      One watchlist subject.
 * @param {object[]} directItems  The shared per-run pool from the outlet feeds.
 * @param {object} overrides    Test replacements for buildDeps.
 * @returns {Promise<void>}
 */
export async function huntSubject(db, subject, directItems = [], overrides = {}) {
  const deps = buildDeps(overrides);

  // Discover this run's candidates and any stranded earlier deliveries.
  const { fetched, candidates } = await collectCandidates(deps, db, subject, directItems);
  const resends = await loadPendingResends(deps, db, subject);
  if (candidates.length === 0 && resends.length === 0) {
    console.log(`${subject.name}: ${fetched.length} fetched, nothing new`);
    return;
  }

  // One batch embedding call for every candidate title.
  const vectors = await embedTitles(deps, db, subject, candidates);

  // Classify each candidate and write its rows, strictly in order: item N's
  // insert must land before item N+1's nearest-neighbour query.
  const outcomes = [];
  for (const [index, item] of candidates.entries()) {
    const outcome = await classifyItem(deps, db, subject, item, vectors?.[index] ?? null);
    await recordOutcome(deps, db, outcome);
    outcomes.push(outcome);
  }

  // Sort the outcomes into messages, translate what the group can't read, send.
  const messages = assembleMessages(subject, fetched.length, outcomes, resends);
  await translateForeignHeadlines(deps, messages.digestItems);
  await deliver(deps, db, subject, messages);
}

/**
 * Stage 1 — fetch the feeds, drop URLs already stored, apply the per-subject cap.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} directItems
 * @returns {Promise<{ fetched: object[], candidates: object[] }>}
 */
async function collectCandidates(deps, db, subject, directItems) {
  const fetched = await fetchFreshItems(subject, directItems, deps.hoursBack);

  // Gate 1: exact URLs we already know. The flood cap applies to unseen items
  // only. History: docs/decisions.md#flood-cap-order
  const known = db ? await deps.store.knownUrls(db, fetched.map((item) => item.url)) : new Set();
  const unseen = fetched.filter((item) => !known.has(item.url));
  const candidates = unseen.slice(0, MAX_ITEMS_PER_SUBJECT);
  if (unseen.length > candidates.length) {
    console.log(`${subject.name}: capped ${unseen.length} unseen to ${candidates.length}, rest next run`);
  }

  return { fetched, candidates };
}

/**
 * Stage 2 — items an earlier run stored but could not deliver. Fetched before
 * the nothing-new return so a quiet hour still carries them, and read even
 * under DRY_RUN (a dry run previews the carry; nothing is written back).
 * History: docs/decisions.md#resend-pass
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @returns {Promise<object[]>}  Stored rows, not pipeline items.
 */
async function loadPendingResends(deps, db, subject) {
  if (!db) return [];
  return deps.store.pendingResends(db, subject.name, HOURS_BACK);
}

/**
 * Stage 3 — one batch embedding call for the candidate titles. Embedding
 * failure degrades to URL-only dedup, never to a failed run.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} candidates
 * @returns {Promise<number[][]|null>}  One vector per candidate, or null.
 */
async function embedTitles(deps, db, subject, candidates) {
  if (!db) return null;

  try {
    return await deps.embedTexts(candidates.map((item) => item.title));
  } catch (err) {
    console.warn(`${subject.name}: embedding failed, URL dedup only:`, err.message);
    return null;
  }
}

/**
 * Stage 4 — decides what one item is: a duplicate to hold, a wrong-subject
 * namesake, another sighting of a known claim, or something to post. Reads the
 * database, never writes it; every decision comes back as one outcome object
 * for recordOutcome.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @param {number[]|null} vector  This item's title embedding.
 * @returns {Promise<object>}  `{ kind: "held"|"wrong-subject"|"match"|"post", item, ... }`.
 */
async function classifyItem(deps, db, subject, item, vector) {
  // Stamp the fields every stored row carries.
  item.subject = subject.name;
  item.embedding = vector;
  item.embeddingModel = EMBEDDING_MODEL;

  // Nearest POSTED neighbour (held articles are nobody's anchor — History:
  // docs/decisions.md#posted-anchors), looked up BEFORE this item is inserted
  // so an item never matches itself. Recorded on every item — the similarity
  // distribution is threshold-tuning data.
  const nearest = item.embedding ? await deps.store.nearestRecent(db, subject.name, item.embedding) : null;
  item.nearestSimilarity = nearest?.similarity ?? null;
  item.nearestItem = nearest?.id ?? null;

  const official = isOfficialSource(item.source);

  // Gate 2: a confident embedding duplicate is held, no LLM needed.
  const earlyHold = checkDuplicateGate(subject, item, nearest, official, null);
  if (earlyHold) return heldOutcome(item, earlyHold, item.nearestItem, "embedding");

  // Body step: decode Google's wrapper, catch the cross-source duplicate the
  // real URL reveals, then fetch and extract the article.
  const urlDuplicateId = await extractBody(deps, db, subject, item);
  if (urlDuplicateId) return heldOutcome(item, "echo", urlDuplicateId, "url");

  // Gate 3: the claim matcher (absorbs the gray-zone judge — a MATCH-as-echo
  // verdict IS the dedup decision).
  const verdict = await askMatcher(deps, db, subject, item);

  // Namesake / junk: recorded for audit, never posted, never a claim.
  if (verdict.verdict === "WRONG_SUBJECT") {
    item.posted = false;
    item.heldReason = "wrong_subject";
    return { kind: "wrong-subject", item };
  }

  // Same fact, another sighting: held as evidence.
  if (verdict.verdict === "MATCH" && verdict.match_claim_id) {
    item.posted = false;
    item.heldReason = "llm";
    return {
      kind: "match",
      item,
      claimId: verdict.match_claim_id,
      official,
      stance: verdict.stance ?? "asserts",
    };
  }

  // Gate 2, re-applied: the official exemption was a deferral, not a waiver.
  const lateHold = checkDuplicateGate(subject, item, nearest, official, verdict);
  if (lateHold) return heldOutcome(item, lateHold, item.nearestItem, "embedding");

  // NO_CLAIM / UNSURE / NEW from here on: the item itself gets posted.
  const newClaim = verdict.verdict === "NEW" ? verdict.new_claim : null;
  const isRealClaim = Boolean(newClaim && !domain.ignoredTypes.includes(newClaim.type)); // docs §5

  // Digest tier (lib/tier.js): is this article ABOUT the subject, or does it
  // merely sit next to news about them? The matcher's role judgement leads;
  // the mention-count rule is the fallback. Keyed on isRealClaim, not claimId.
  // History: docs/decisions.md#tier-keying
  item.digestTier = isRealClaim ? "main" : digestTierFor(item, subject.matchNames, item.subjectRole);
  item.posted = true;

  // A brand-new claim is born confirmed only on official sourcing.
  const status = isRealClaim
    ? (official || newClaim.sourcing === "official" ? "confirmed" : "rumor")
    : null;

  return { kind: "post", item, newClaim, isRealClaim, official, status, claimId: null };
}

/**
 * Marks an item held and shapes the outcome recordOutcome stores it under.
 *
 * @param {object} item
 * @param {string} role        Claim-link role: "echo" or "official".
 * @param {number|null} neighborId  The stored item whose claim it may inherit.
 * @param {string} reason      What held it: "embedding" or "url".
 * @returns {object}
 */
function heldOutcome(item, role, neighborId, reason) {
  item.posted = false;
  item.heldReason = reason;
  return { kind: "held", item, role, neighborId };
}

/**
 * Gate 2: should this item be held as a semantic duplicate? Applied twice per
 * item. Before the matcher (`verdict` null) official sources are exempt — an
 * official confirmation is near-identical to the rumor it confirms, and
 * holding it would swallow the rumor -> confirmed transition. After the
 * matcher, on UNSURE / NO_CLAIM there is no claim to act on, so the reason to
 * skip the gate is gone and it stands.
 * History: docs/decisions.md#official-exemption
 *
 * @param {object} subject
 * @param {object} item
 * @param {object|null} nearest   Nearest stored neighbour with its similarity.
 * @param {boolean} official
 * @param {object|null} verdict   The matcher's verdict, or null before it ran.
 * @returns {string|null}  The claim-link role to hold under, or null to pass.
 */
function checkDuplicateGate(subject, item, nearest, official, verdict) {
  const isDuplicate = Boolean(nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD);
  if (!isDuplicate) return null;

  // First application: hold every non-official duplicate outright.
  if (!verdict) {
    if (official) return null;
    console.log(
      `${subject.name}: held as dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
    );
    return "echo";
  }

  // Re-application: the deferred official duplicate, with no claim to act on.
  if (official && ["UNSURE", "NO_CLAIM"].includes(verdict.verdict)) {
    console.log(
      `${subject.name}: matcher ${verdict.verdict}, holding official dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
    );
    return "official";
  }

  return null;
}

/**
 * The body step, only for items past the free gates: decode Google's wrapper,
 * check whether the real URL is already stored, then fetch and extract the
 * article text onto the item. All of it is a bonus — any failure leaves the
 * item headline-only.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @returns {Promise<number|null>}  A stored item id when the decoded URL is a
 *   duplicate (the caller holds this item), otherwise null.
 */
async function extractBody(deps, db, subject, item) {
  try {
    const resolved = await deps.decodeGoogleNewsUrl(item.url);
    item.resolvedUrl = resolved ?? null; // null = wrapped URL we couldn't open

    // The decoded URL can reveal a cross-source duplicate Gate 1 missed.
    if (resolved && resolved !== item.url && db) {
      const duplicateId = await deps.store.itemIdByUrl(db, resolved);
      if (duplicateId) {
        console.log(`${subject.name}: held as url dup (decoded to stored item #${duplicateId}): ${item.title.slice(0, 60)}`);
        return duplicateId;
      }
    }

    // Fetch the article body, or fall back to the feed's own content.
    if (item.resolvedUrl || item.feedContent) {
      const bodyResult = await deps.fetchArticleBody(item.resolvedUrl, { feedContent: item.feedContent });
      item.body = bodyResult.body;
      item.bodyFetchedAt = bodyResult.fetchedAt ?? null;
      item.bodyVia = bodyResult.via;
      console.log(
        `${subject.name}: body ${bodyResult.body ? `${bodyResult.body.length} chars via ${bodyResult.via}` : `none (${bodyResult.via})`}: ${item.title.slice(0, 50)}`
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

  return null;
}

/**
 * Asks the claim matcher what this item is. Fail-open: matcher trouble ->
 * UNSURE -> the item posts like it always did.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @returns {Promise<object>}  The matcher's verdict object.
 */
async function askMatcher(deps, db, subject, item) {
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

  return verdict;
}

// How much worse the inherited claim may fit before we refuse to inherit.
// History: docs/decisions.md#claim-drift-gap
const CLAIM_DRIFT_GAP = Number(process.env.CLAIM_DRIFT_GAP || 0.1);

/**
 * Would inheriting `claimId` be a mistake? Dup chains are transitive and can
 * walk onto a foreign claim, so ask the cheaper-than-an-LLM question: does this
 * headline sit far closer to some OTHER claim than the one it would join?
 * History: docs/decisions.md#claim-drift-gap
 *
 * @param {object} deps
 * @param {object} db
 * @param {object} item
 * @param {number} claimId  The claim the item is about to inherit.
 * @returns {Promise<boolean>}
 */
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

/**
 * Stage 5 — every database write for one classified item. On a dry run, or
 * with no database, nothing is written. A "match" outcome may gain a
 * `confirmation` entry here (a rumor an official source just confirmed).
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} outcome  From classifyItem.
 * @returns {Promise<void>}
 */
async function recordOutcome(deps, db, outcome) {
  const { item } = outcome;

  // Held as a duplicate: recorded for audit, never posted, and linked to its
  // neighbour's claim — unless that link would drift onto a foreign claim, in
  // which case the hold stands and the item stays unlinked.
  // History: docs/decisions.md#claim-drift-gap
  if (outcome.kind === "held") {
    if (!db || deps.dryRun) return;
    const itemId = await deps.store.insertItem(db, item);
    const inheritedClaimId = await deps.store.claimOfItem(db, outcome.neighborId);
    if (!itemId || !inheritedClaimId) return;
    if (await inheritanceDrifts(deps, db, item, inheritedClaimId)) return;
    await deps.store.linkClaimSource(db, itemId, inheritedClaimId, outcome.role);
    return;
  }

  // Wrong subject: the row is the audit trail, nothing links to it.
  if (outcome.kind === "wrong-subject") {
    if (db && !deps.dryRun) await deps.store.insertItem(db, item);
    return;
  }

  // Another sighting of a known claim: stored and linked as evidence.
  if (outcome.kind === "match") {
    if (!db) return;

    // A dry run previews the confirmation a real run would create, reading
    // the claim without flipping it. Nothing is written.
    // History: docs/decisions.md#dry-run-confirmation-preview
    if (deps.dryRun) {
      if (outcome.official && outcome.stance === "asserts") {
        const rumor = await deps.store.claimIfRumor(db, outcome.claimId);
        if (rumor) {
          outcome.confirmation = { text: rumor.canonical_text, replyTo: rumor.tg_message_id, item };
        }
      }
      return;
    }
    const itemId = await deps.store.insertItem(db, item);
    if (itemId) {
      await deps.store.linkClaimSource(db, itemId, outcome.claimId,
        outcome.official ? "official" : "echo", outcome.stance);
    }
    // Conservative lifecycle: only an official source that asserts flips
    // rumor -> confirmed. Denials are linked as evidence, never acted on.
    if (outcome.official && outcome.stance === "asserts") {
      const confirmed = await deps.store.confirmClaim(db, outcome.claimId);
      if (confirmed) {
        outcome.confirmation = { text: confirmed.canonical_text, replyTo: confirmed.tg_message_id, item };
      }
    }
    return;
  }

  // "post": the item row, and — when the matcher minted a real claim — the
  // claim row plus its origin link.
  const itemId = db && !deps.dryRun ? await deps.store.insertItem(db, item) : null;
  item.dbId = itemId;

  if (outcome.isRealClaim && db && !deps.dryRun && itemId) {
    // The claim gets its own embedding; a failure just leaves it vector-less.
    let claimVector = null;
    try { claimVector = (await deps.embedTexts([outcome.newClaim.canonical_text]))?.[0] ?? null; } catch {}

    outcome.claimId = await deps.store.insertClaim(db, {
      subject: item.subject, type: outcome.newClaim.type, canonicalText: outcome.newClaim.canonical_text,
      facts: outcome.newClaim.facts, status: outcome.status, embedding: claimVector, embeddingModel: EMBEDDING_MODEL,
    });
    await deps.store.linkClaimSource(db, itemId, outcome.claimId, outcome.official ? "official" : "origin");
  }
}

/**
 * Stage 6 — sorts the recorded outcomes into the messages this run will send,
 * and folds in the resends from an earlier failed delivery.
 *
 * @param {object} subject
 * @param {number} fetchedCount  How many items discovery returned, for the log.
 * @param {object[]} outcomes    From classifyItem/recordOutcome, in order.
 * @param {object[]} resends     Stored rows from loadPendingResends.
 * @returns {object}  `{ ceremonies, rumorPosts, confirmations, digestClaims, digestItems, tangential }`.
 */
function assembleMessages(subject, fetchedCount, outcomes, resends) {
  const digestItems = [];   // NO_CLAIM / UNSURE items + quote-grade claims
  const rumorPosts = [];    // lifecycle claims born as rumor -> 🕵️ lines
  const ceremonies = [];    // announcements born confirmed -> standalone 🚨
  const confirmations = []; // rumor->confirmed transitions -> threaded replies
  const digestClaims = [];  // claim ids whose home message is the digest
  const tangential = [];    // demoted: one shared "also mentioning" line, not a bullet

  for (const outcome of outcomes) {
    // A confirmed rumor surfaces regardless of what its sighting item became.
    if (outcome.confirmation) confirmations.push(outcome.confirmation);
    if (outcome.kind !== "post") continue;

    const { item, newClaim, isRealClaim, status, claimId } = outcome;

    // A real new claim picks its own message type; quotes etc. ride the digest.
    if (isRealClaim) {
      if (newClaim.type === domain.ceremonyType && status === "confirmed") {
        ceremonies.push({ claimId, text: newClaim.canonical_text, item });
        continue;
      }
      if (status === "rumor" && domain.loudTypes.includes(newClaim.type)) {
        rumorPosts.push({ claimId, text: newClaim.canonical_text, item });
        continue;
      }
      if (claimId) digestClaims.push(claimId);
    }

    (item.digestTier === "tangential" ? tangential : digestItems).push(item);
  }

  const postedCount = ceremonies.length + rumorPosts.length + digestItems.length + tangential.length;
  console.log(
    `${subject.name}: ${fetchedCount} fetched, ${outcomes.length} unseen, ${postedCount} posted ` +
      `(${tangential.length} tangential), ${confirmations.length} confirmation(s)`
  );

  // Resend pass: stranded items ride this run's digest as ordinary bullets,
  // rebuilt from the row and deliberately not re-judged.
  // History: docs/decisions.md#resend-pass
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

  return { ceremonies, rumorPosts, confirmations, digestClaims, digestItems, tangential };
}

/**
 * Strips the " - Source" suffix Google News appends when it matches the item's
 * source; we show the source ourselves.
 *
 * @param {object} item
 * @returns {string}
 */
function cleanTitle(item) {
  return item.title.endsWith(` - ${item.source}`)
    ? item.title.slice(0, -` - ${item.source}`.length)
    : item.title;
}

/**
 * Stage 7 — translates digest headlines the group can't read (claim texts are
 * already English). Tangential items are excluded, a null-edition resend posts
 * as filed, and a failed translation posts the original.
 * History: docs/decisions.md#translation-rules
 *
 * @param {object} deps
 * @param {object[]} digestItems  Mutated: gains `displayTitle` where translated.
 * @returns {Promise<void>}
 */
async function translateForeignHeadlines(deps, digestItems) {
  for (const item of digestItems) {
    if (item.resent && !item.edition) continue;
    if (GROUP_LANGUAGES.has(item.edition)) continue;
    try {
      item.displayTitle = await deps.translate(cleanTitle(item));
    } catch (err) {
      console.warn(`translate failed for "${item.title.slice(0, 40)}":`, err.message);
    }
  }
}

/**
 * Whole hours since `date`, for the "3h ago" digest suffix.
 *
 * @param {Date} date
 * @returns {number}
 */
function hoursAgo(date) {
  return Math.round((Date.now() - date.getTime()) / 3_600_000);
}

/**
 * Renders one digest bullet: plain headline, the source name carries the link,
 * and a translated headline is labeled. Every value is escaped — an unescaped
 * "&" in an href makes Telegram silently reject the whole message.
 * Exported for test/message.test.js; importing this module never starts a hunt.
 *
 * @param {object} item
 * @returns {string}  Telegram HTML.
 *
 * History: docs/decisions.md#telegram-html-escaping
 */
export function digestLine(item) {
  const title = item.displayTitle ?? cleanTitle(item);
  const label = item.displayTitle ? ` (translated from ${item.edition})` : "";
  return `• ${escapeHtml(title)} — <a href="${escapeHtml(item.url)}">${escapeHtml(item.source)}</a>${label}, ${hoursAgo(item.publishedAt)}h ago`;
}

/**
 * Renders the one shared line carrying every demoted item, as source links
 * rather than headlines.
 *
 * @param {object[]} items  Demoted items, newest first.
 * @returns {string}  Telegram HTML: "↘ Also mentioning: Sherdog · ESPN (1) · ESPN (2)"
 *
 * History: docs/decisions.md#tangential-line
 */
export function alsoMentioningLine(items) {
  const outlets = groupByOutlet(items);
  const links = [];

  // Number the links only when an outlet has more than one, so a lone
  // "Sherdog (1)" never implies a missing sibling.
  for (const { name, urls } of outlets) {
    for (const [index, url] of urls.entries()) {
      const label = urls.length > 1 ? `${name} (${index + 1})` : name;
      links.push(anchor(url, label));
    }
  }

  return `↘ Also mentioning: ${links.join(" · ")}`;
}

/**
 * Groups items by outlet, keeping input order within each group.
 * Identical URLs collapse — the same article reached twice is one story.
 *
 * @param {object[]} items
 * @returns {{ name: string, urls: string[] }[]}
 */
function groupByOutlet(items) {
  const byName = new Map();

  for (const item of items) {
    // Fall back to the hostname: a missing <source> tag would otherwise
    // render an invisible, zero-width link.
    const name = item.source.trim() || hostOf(articleUrl(item));
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, urls: [] });

    const outlet = byName.get(key);
    const url = articleUrl(item);
    if (!outlet.urls.includes(url)) outlet.urls.push(url);
  }

  return [...byName.values()];
}

/** The real article URL, once Google's wrapper has been decoded. */
function articleUrl(item) {
  return item.resolvedUrl ?? item.url;
}

/** An escaped Telegram HTML anchor. */
function anchor(url, label) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

/**
 * The link's hostname without "www.", or "source" when the URL won't parse.
 *
 * @param {string} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/**
 * Stage 8 — sends the three message types, in order: standalone ceremonies,
 * the digest, then confirmation replies.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} messages  From assembleMessages.
 * @returns {Promise<void>}
 */
async function deliver(deps, db, subject, messages) {
  await sendCeremonies(deps, db, subject, messages.ceremonies);
  await sendDigest(deps, db, subject, messages);
  await sendConfirmations(deps, messages.confirmations);
}

/**
 * Walks back rows written posted=true before a send that then failed — or the
 * archive asserts the group saw something it never did.
 * History: docs/decisions.md#send-failure-walkback
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} items  The items the failed message carried.
 * @param {string} what     Which message type failed, for the log.
 * @returns {Promise<void>}
 */
async function markSendFailed(deps, db, subject, items, what) {
  const ids = items.map((item) => item.dbId).filter(Boolean);
  console.error(`${subject.name}: ${what} send failed — ${ids.length} item(s) marked unposted`);
  if (db && !deps.dryRun && ids.length) {
    await deps.store.markUnposted(db, ids, "send_failed");
  }
}

/**
 * One standalone post per confirmed announcement.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} ceremonies
 * @returns {Promise<void>}
 */
async function sendCeremonies(deps, db, subject, ceremonies) {
  for (const ceremony of ceremonies) {
    const message = `🚨 <b>${escapeHtml(domain.ceremonyLabel)}</b>\n\n<b>${escapeHtml(ceremony.text)}</b>\n\n— <a href="${escapeHtml(ceremony.item.url)}">${escapeHtml(ceremony.item.source)}</a>`;
    if (deps.dryRun) {
      console.log(`\n--- would post (ceremony) ---\n${message}\n`);
      continue;
    }

    const messageId = await deps.sendMessage(deps.chatId, message, { html: true, noPreview: true });
    if (db && ceremony.claimId) await deps.store.setClaimMessageId(db, ceremony.claimId, messageId);
    if (!messageId) await markSendFailed(deps, db, subject, [ceremony.item], "ceremony");
  }
}

/**
 * The digest: rumor lines first, then regular bullets, then one shared line
 * for the tangential — attached only when there is a real line above it.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} messages  From assembleMessages.
 * @returns {Promise<void>}
 */
async function sendDigest(deps, db, subject, messages) {
  const { rumorPosts, digestItems, tangential, digestClaims } = messages;

  // Build the lines in display order.
  const lines = [];
  for (const rumor of rumorPosts) {
    lines.push(
      `🕵️ <b>Rumor:</b> ${escapeHtml(rumor.text)} — <a href="${escapeHtml(rumor.item.url)}">${escapeHtml(rumor.item.source)}</a>, ${hoursAgo(rumor.item.publishedAt)}h ago`
    );
  }
  for (const item of digestItems) {
    lines.push(digestLine(item));
  }
  if (tangential.length > 0 && lines.length > 0) lines.push(alsoMentioningLine(tangential));

  // Every posted item this run was tangential — a header plus an "also
  // mentioning" line is exactly the noise this rule removes, so nothing is
  // sent, and the rows already written posted=true are corrected.
  // History: docs/decisions.md#send-failure-walkback
  if (lines.length === 0) {
    if (tangential.length > 0) {
      console.log(`${subject.name}: ${tangential.length} tangential item(s) only — nothing broadcast`);
      if (db && !deps.dryRun) {
        await deps.store.markUnposted(db, tangential.map((item) => item.dbId).filter(Boolean), "tangential");
      }
    }
    return;
  }

  const message = `🔎 <b>${escapeHtml(subject.name)}</b>\n\n${lines.join("\n\n")}`;
  if (deps.dryRun) {
    console.log(`\n--- would post ---\n${message}\n`);
    return;
  }

  const messageId = await deps.sendMessage(deps.chatId, message, { html: true, noPreview: true });
  if (db && messageId) {
    // The digest is these claims' home message.
    for (const rumor of rumorPosts) {
      if (rumor.claimId) await deps.store.setClaimMessageId(db, rumor.claimId, messageId);
    }
    for (const claimId of digestClaims) {
      await deps.store.setClaimMessageId(db, claimId, messageId);
    }

    // Delivered at last: the rows that were carrying 'send_failed' go back
    // to saying the group has seen them.
    const recovered = [...digestItems, ...tangential].filter((item) => item.resent).map((item) => item.dbId);
    if (recovered.length) {
      await deps.store.markPosted(db, recovered);
      console.log(`${subject.name}: ${recovered.length} recovered item(s) delivered`);
    }
  }

  // One message carries every line, so one failure loses all of them. The
  // claims stay: a claim is a fact we learned, not a message we sent.
  if (!messageId) {
    await markSendFailed(deps, db, subject,
      [...rumorPosts.map((rumor) => rumor.item), ...digestItems, ...tangential], "digest");
  }
}

/**
 * Confirmations: threaded replies to the original rumor post.
 *
 * @param {object} deps
 * @param {object[]} confirmations
 * @returns {Promise<void>}
 */
async function sendConfirmations(deps, confirmations) {
  for (const confirmation of confirmations) {
    const message = `✅ <b>Confirmed</b> — ${escapeHtml(confirmation.text)}\n${anchor(articleUrl(confirmation.item), confirmation.item.source)}`;
    if (deps.dryRun) {
      console.log(`\n--- would post (confirmation) ---\n${message}\n`);
    } else {
      await deps.sendMessage(deps.chatId, message, { html: true, noPreview: true, replyTo: confirmation.replyTo });
    }
  }
}

/**
 * Assembles the dependency set a run starts on — the same seam pattern as
 * buildDeps, one level up. Every default is the real implementation. The
 * variable is named `mainDeps` at every use site so this seam and huntSubject's
 * each get their own exact wiring test.
 *
 * @param {object} overrides  Test replacements, merged over the defaults.
 * @returns {object}
 *
 * History: docs/decisions.md#deps-seam
 */
function buildMainDeps(overrides) {
  return {
    loadSubjects,
    openDb,
    fetchOutletItems,
    huntSubject,
    outlets: OUTLETS,
    dryRun: DRY_RUN,
    chatId: CHAT_ID,
    databaseUrl: process.env.DATABASE_URL,
    ...overrides,
  };
}

/**
 * One whole run: config check, load the watchlist, open the database, fetch
 * the shared outlet feeds, then hunt every subject.
 * Exported for test/startup.test.js; the entry guard below is what runs it in
 * production.
 *
 * @param {object} overrides  Test replacements for buildMainDeps.
 * @returns {Promise<void>}
 */
export async function main(overrides = {}) {
  const mainDeps = buildMainDeps(overrides);

  // Config first: nowhere to post and not a dry run is a startup error.
  if (!mainDeps.dryRun && !mainDeps.chatId) {
    throw new Error("TELEGRAM_CHAT_IDS is required unless DRY_RUN=1");
  }

  // Before the database and the feeds: a missing watchlist is a config error,
  // and there is no point opening connections to discover it.
  const subjects = await mainDeps.loadSubjects();

  // No DATABASE_URL (secret-free local run) -> no dedup. But if a DB is
  // configured and unreachable, fail the whole run: memory-less posting
  // would re-spam the group every hour.
  const db = mainDeps.databaseUrl ? await mainDeps.openDb() : null;
  if (!db) console.warn("No DATABASE_URL — running without dedup memory.");

  const directItems = await collectDirectItems(mainDeps, subjects);

  // Hunt every subject, closing the database no matter how the run ends.
  try {
    let failures = 0;
    for (const subject of subjects) {
      try {
        await mainDeps.huntSubject(db, subject, directItems);
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

/**
 * Fetches the direct publisher feeds: one fetch per outlet per run, shared
 * across subjects. A dead outlet is a warning, never a failed run — and if
 * Google 503s a whole run, these still deliver.
 *
 * @param {object} mainDeps
 * @param {object[]} subjects  The watchlist, for the match counters.
 * @returns {Promise<object[]>}  The pooled items from every healthy outlet.
 */
async function collectDirectItems(mainDeps, subjects) {
  const directItems = [];
  const results = await Promise.allSettled(
    mainDeps.outlets.map((outlet) => mainDeps.fetchOutletItems(outlet))
  );

  results.forEach((result, index) => {
    const outletId = mainDeps.outlets[index].id;
    if (result.status !== "fulfilled") {
      console.warn(`direct feed ${outletId} failed:`, result.reason.message);
      return;
    }
    directItems.push(...result.value);

    // Outlet feeds are name-filtered before anything is stored, so a rotted
    // matchNames stem would look exactly like quiet news; these counts are
    // the evidence that separates the two.
    // History: docs/decisions.md#outlet-match-counters
    const matched = result.value.filter((item) => subjects.some((subject) => matchesSubject(item, subject))).length;
    console.log(
      `direct feed ${outletId}: ${result.value.length} items, ${matched} matched, ${result.value.length - matched} discarded`,
    );
  });

  return directItems;
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
