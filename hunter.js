// The RingFacts hunter.
// Each run: fetch Google News RSS per subject -> drop URLs already in the DB
// -> fetch the article bodies -> embed headline plus body -> ask the decider
// which story each article is -> post the ones that open a story -> record
// everything. The unit is the story, not the claim.
// History: docs/decisions.md#stories-as-objects
//
// Degradation ladder: no DATABASE_URL -> no dedup (local dry runs);
// embedding API down -> URL dedup only; decider unavailable -> the old
// similarity threshold stands in for it. DB configured but unreachable is
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
import { runBackup, isBackupRun } from "./lib/backup.js";
import { domainOf, isUntrustedSource } from "./lib/untrusted.js";
import { renderMentionsDigest } from "./lib/mentions.js";
import { domain } from "./domain/index.js";
import { fileURLToPath } from "node:url";

// Editions the group reads as-is; anything else is translated at posting time
// and labeled. History: docs/decisions.md#translation-rules
const GROUP_LANGUAGES = new Set(["en", "uk"]);

const DRY_RUN = process.env.DRY_RUN === "1";
// Read at call time so the run's environment can flip it without a deploy.
const newsGateOn = () => process.env.NEWS_GATE_OFF !== "1";
// From the single telegram-chat-ids secret (lib/chat-ids.js explains why).
// `required: false` lets a dry or offline run import with no chat configured; a
// present-but-malformed value still throws at startup. ADMIN_CHAT_ID takes the
// failure self-reports; they never go to the group.
const { group: CHAT_ID, admin: ADMIN_CHAT_ID } = readChatIds({ required: false });
const HOURS_BACK = Number(process.env.HOURS_BACK || 24);
const MAX_ITEMS_PER_SUBJECT = 5;
// Daily backup: on inside Cloud Run (the job carries no plain env vars, so the
// bucket is derived from the project id) or when BACKUP_BUCKET names one.
const BACKUP_BUCKET = process.env.BACKUP_BUCKET;
const BACKUP_ENABLED = Boolean(BACKUP_BUCKET || process.env.CLOUD_RUN_JOB);
const BACKUP_HOUR_UTC = Number(process.env.BACKUP_HOUR_UTC || 11);
// The mentions digest sweeps queued mentions this many days back; older ones
// age out unsent — a stale "next Saturday" link reads dead.
const MENTIONS_WINDOW_DAYS = Number(process.env.MENTIONS_WINDOW_DAYS || 7);
// The fallback gate's line: with no decider, cosine similarity above this
// counts as the same story. Reads the old env name so a deployed override
// still applies. History: docs/decisions.md#stories-as-objects
const FALLBACK_DUP_THRESHOLD = Number(process.env.SEMANTIC_DUP_THRESHOLD || 0.85);
// How far back the decider's shortlist looks, and how many stories it offers.
const STORY_WINDOW_DAYS = Number(process.env.STORY_WINDOW_DAYS || 7);
const STORY_SHORTLIST = Number(process.env.STORY_SHORTLIST || 3);

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

  // Google News, one fetch per alias, each item stamped with where it was
  // found. An alias that fails after its retry is skipped, not fatal: the
  // direct feeds below are the alternate source, and a Google outage must
  // not throw them away. History: docs/decisions.md#google-outage-degrades
  const items = [];
  let failedAliases = 0;
  for (const alias of subject.aliases) {
    let found;
    try {
      found = parseRssItems(await fetchFeed(alias));
    } catch (err) {
      failedAliases++;
      console.warn(`${subject.name}: alias skipped — ${err.message}`);
      continue;
    }
    for (const item of found) {
      item.edition = alias.edition;
      item.foundVia = `${alias.edition} ${alias.query}`;
    }
    items.push(...found);
  }

  // Every alias down is worth its own line: a check-in run greps for it, and
  // "nothing new" from a blinded run must not read as quiet news (§5).
  if (subject.aliases.length > 0 && failedAliases === subject.aliases.length) {
    console.warn(`Google News down for ${subject.name}: ${failedAliases}/${subject.aliases.length} aliases failed; continuing on direct feeds only`);
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
    // A missing key means no decider — same path as a thrown call, and what
    // puts the fallback threshold gate in charge for the run.
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

  // Bodies first: decode Google's wrapper, catch the url duplicate, fetch the
  // text. The decider reads the article, so the article has to exist first.
  const urlDuplicates = await fetchBodies(deps, db, subject, candidates);

  // One batch embedding call: headline plus the first 1500 characters of body.
  const vectors = await embedCandidates(deps, db, subject, candidates);

  // Classify each candidate and write its rows, strictly in order: item N's
  // insert must land before item N+1's shortlist query.
  const outcomes = [];
  for (const [index, item] of candidates.entries()) {
    const outcome = await classifyItem(deps, db, subject, item, vectors?.[index] ?? null, urlDuplicates.get(item));
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
 * Stage 3 — the body step for every candidate: decode Google's wrapper, catch
 * the cross-source duplicate the real URL reveals, fetch and extract the
 * article text. Runs before the embedding and before the decider, so a held
 * article carries its address and its text like any other.
 * History: docs/decisions.md#stories-as-objects
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} candidates  Mutated: each gains `resolvedUrl`, `body`, `bodyVia`.
 * @returns {Promise<Map<object, object>>}  The duplicate candidates, mapped to
 *   `{ storedId }` when the address is already in the archive, or
 *   `{ twinOf }` when an earlier candidate of this same run has it.
 */
async function fetchBodies(deps, db, subject, candidates) {
  const urlDuplicates = new Map();
  const firstByAddress = new Map();

  for (const item of candidates) {
    const storedId = await extractBody(deps, db, subject, item);
    if (storedId) {
      urlDuplicates.set(item, { storedId });
      continue;
    }

    // Two wrappers of one article in the same run: nothing is stored yet, so
    // the later one is marked a twin of the earlier and picks up its row id
    // in the classify loop, which runs in this same order.
    const address = item.resolvedUrl ?? item.url;
    const firstItem = firstByAddress.get(address);
    if (firstItem) {
      console.log(`${subject.name}: held as url dup (same address as an earlier item this run): ${item.title.slice(0, 60)}`);
      urlDuplicates.set(item, { twinOf: firstItem });
    } else {
      firstByAddress.set(address, item);
    }
  }

  return urlDuplicates;
}

/**
 * What one item is embedded as: the headline, plus the opening of the article
 * body when there is one. The body is what separates two articles that share a
 * headline, so the vector has to carry it.
 * Exported so a stored row can be re-embedded exactly the way it was first.
 *
 * @param {object} item
 * @returns {string}
 */
export function embeddingText(item) {
  return item.body ? `${item.title}\n\n${item.body.slice(0, 1500)}` : item.title;
}

/**
 * Stage 4 — one batch embedding call for the candidate texts. Embedding
 * failure degrades to URL-only dedup, never to a failed run.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object[]} candidates
 * @returns {Promise<number[][]|null>}  One vector per candidate, or null.
 */
async function embedCandidates(deps, db, subject, candidates) {
  if (!db) return null;

  try {
    return await deps.embedTexts(candidates.map(embeddingText));
  } catch (err) {
    console.warn(`${subject.name}: embedding failed, URL dedup only:`, err.message);
    return null;
  }
}

/**
 * Stage 5 — decides what one item is: an article we already have under some
 * address, a namesake, another sighting of a story we are already telling, or
 * a story of its own. Reads the database, never writes it; every decision
 * comes back as one outcome object for recordOutcome.
 * History: docs/decisions.md#stories-as-objects
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @param {number[]|null} vector  This item's headline-plus-body embedding.
 * @param {object|undefined} urlDuplicate  Set when stage 3 found this item's
 *   address elsewhere: `{ storedId }` in the archive, `{ twinOf }` this run.
 * @returns {Promise<object>}  `{ kind: "held"|"wrong-subject"|"untrusted"|"match"|"post", item, ... }`.
 */
async function classifyItem(deps, db, subject, item, vector, urlDuplicate) {
  // Stamp the fields every stored row carries.
  item.subject = subject.name;
  item.embedding = vector;
  item.embeddingModel = EMBEDDING_MODEL;

  // Nearest POSTED neighbour (held articles are nobody's anchor — History:
  // docs/decisions.md#posted-anchors), looked up BEFORE this item is inserted
  // so an item never matches itself. Audit columns only now: it decides
  // nothing unless the decider is unavailable.
  const nearest = item.embedding ? await deps.store.nearestRecent(db, subject.name, item.embedding) : null;
  item.nearestSimilarity = nearest?.similarity ?? null;
  item.nearestItem = nearest?.id ?? null;

  const official = isOfficialSource(item.source);

  // The same address under another wrapper: certainly the same article. A
  // twin's neighbour is the row the earlier item just got, which is null when
  // that item was never stored (a dry run, or an insert that returned null).
  if (urlDuplicate) {
    const neighborId = urlDuplicate.twinOf ? urlDuplicate.twinOf.dbId ?? null : urlDuplicate.storedId;
    return heldOutcome(item, "echo", neighborId, "url");
  }

  // The decider: which of this subject's recent stories is this article, if any?
  const decision = await decideStory(deps, db, subject, item);

  // Namesake / junk: recorded for audit, never posted, never a claim.
  if (decision.verdict === "WRONG_SUBJECT") {
    item.posted = false;
    item.heldReason = "wrong_subject";
    return { kind: "wrong-subject", item };
  }

  // A story we are already telling: held as another sighting of it.
  if (decision.decision === "join") return joinOutcome(item, decision, official);

  // No decider this run, or a working decider that could not decide: either
  // way there is no verdict to act on, so the old similarity threshold stands
  // in — a matcher outage or an UNSURE answer must not turn every echo into a
  // second post.
  if (decision.unavailable || decision.decision === null) {
    if (!decision.unavailable) console.log(`${subject.name}: fallback (UNSURE): ${item.title.slice(0, 60)}`);
    const fallbackRole = checkDuplicateGate(subject, item, nearest);
    if (fallbackRole) return heldOutcome(item, fallbackRole, item.nearestItem, "embedding");
  }

  // Untrusted source: keyword spam the decider could not see through, judged
  // by the domain's own record. After the decider on purpose, so the record
  // keeps growing; before anything can post or open a story.
  if (await isFromUntrustedSource(deps, db, subject, item)) {
    item.posted = false;
    item.heldReason = "untrusted_source";
    return { kind: "untrusted", item };
  }

  return postOutcome(subject, item, decision, official);
}

/**
 * The join branch: this article says what a story we already carry says, so it
 * is held and recorded on that story — and on the story's claim, when it has one.
 *
 * @param {object} item
 * @param {object} decision  The decider's answer, carrying the shortlist it saw.
 * @param {boolean} official
 * @returns {object}
 */
function joinOutcome(item, decision, official) {
  const story = namedStory(decision);
  item.posted = false;
  item.heldReason = "story";
  item.storyId = namedStoryId(decision);
  item.storyDecision = "join";
  return {
    kind: "match",
    item,
    storyId: item.storyId,
    claimId: story?.claim_id ?? null,
    official,
    stance: decision.stance ?? "asserts",
  };
}

/**
 * The post branch: this article opens a story of its own, either brand new or
 * a reaction to one we already carry. The claim, the digest tier and the
 * delivery speed are decided here exactly as they were before stories existed.
 *
 * @param {object} subject
 * @param {object} item
 * @param {object} decision
 * @param {boolean} official
 * @returns {object}
 */
function postOutcome(subject, item, decision, official) {
  const candidateClaim = decision.verdict === "NEW" ? decision.new_claim : null;
  const isLoud = Boolean(candidateClaim && domain.loudTypes.includes(candidateClaim.type));

  // The reader's test (goals.md): would a follower learn something new about
  // him? A "no" folds a non-event into the mentions archive even when the
  // decider minted a quote for it — a quote nobody learns from is not news.
  // A loud claim (a booking, a result, an injury) is never folded this way:
  // an event is news whatever the model thinks of the article. Null (decider
  // off, failed, or an older answer) changes nothing. NEWS_GATE_OFF=1 is the
  // kill switch. History: docs/decisions.md#news-for-followers
  const nothingNew = item.newsForFollowers === "no" && !isLoud && newsGateOn();
  const newClaim = nothingNew ? null : candidateClaim;
  const isRealClaim = Boolean(newClaim && !domain.ignoredTypes.includes(newClaim.type)); // docs §5

  // Digest tier (lib/tier.js): is this article ABOUT the subject, or does it
  // merely sit next to news about them? The decider's role judgement leads;
  // the mention-count rule is the fallback. Keyed on isRealClaim, not claimId.
  // History: docs/decisions.md#tier-keying
  item.digestTier = isRealClaim ? "main"
    : nothingNew ? "tangential"
    : digestTierFor(item, subject.matchNames, item.subjectRole);

  // Two speeds of delivery: real news posts now; a tangential mention is
  // queued for the daily mentions digest and never rides the hourly message.
  // History: docs/decisions.md#mentions-digest
  const isQueuedMention = item.digestTier === "tangential";
  item.posted = !isQueuedMention;
  item.heldReason = isQueuedMention ? "tangential" : null;

  // A brand-new claim is born confirmed only on official sourcing.
  const status = isRealClaim
    ? (official || newClaim.sourcing === "official" ? "confirmed" : "rumor")
    : null;

  // The decider answered ("new" or "reaction") only when it actually judged
  // the article; a null decision.decision means the fallback threshold gate
  // let this item through on its own — the story it opens is not one the
  // decider placed.
  const decidedByModel = decision.decision === "new" || decision.decision === "reaction";

  return {
    kind: "post", item, newClaim, isRealClaim, official, status, claimId: null,
    fact: decision.fact ?? item.title,
    decision: decision.decision ?? "new",
    decidedBy: decidedByModel ? "story" : "fallback",
    reactsTo: decision.decision === "reaction" ? namedStoryId(decision) : null,
  };
}

/**
 * The shortlist row the decider pointed at, or null. Ids are compared as
 * strings on purpose: Postgres bigints arrive from pg as strings ("7") while
 * the model answers with a JSON number (7).
 *
 * @param {object} decision
 * @returns {object|null}
 */
function namedStory(decision) {
  if (decision.story_id === null || decision.story_id === undefined) return null;
  return (decision.stories ?? []).find((story) => String(story.id) === String(decision.story_id)) ?? null;
}

/**
 * That story's id as a string, or null when the decider named none — or
 * named one not on the shortlist it was shown, which must never write a
 * dangling id into items.story_id or stories.reacts_to.
 *
 * @param {object} decision
 * @returns {string|null}
 */
function namedStoryId(decision) {
  return namedStory(decision)?.id ?? null;
}

/**
 * Does this item's domain have the record that earns a hold? Needs a database
 * — the record IS the archive — and a parseable real address.
 * History: docs/decisions.md#untrusted-source
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @returns {Promise<boolean>}
 */
async function isFromUntrustedSource(deps, db, subject, item) {
  if (!db) return false;
  const domain = domainOf(item.resolvedUrl ?? item.url);
  if (!domain) return false;

  const record = await deps.store.domainRecord(db, domain);
  const untrusted = isUntrustedSource(record);
  if (untrusted) {
    console.log(`${subject.name}: held, untrusted source ${domain} ` +
      `(${record.wrongSubject}/${record.items} wrong-subject, ${record.bodies} bodies): ${item.title.slice(0, 60)}`);
  }
  return untrusted;
}

/**
 * Marks an item held and shapes the outcome recordOutcome stores it under.
 *
 * @param {object} item
 * @param {string} role        Claim-link role for the neighbour's claim: "echo".
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
 * The fallback gate: with no decider this run, should this item be held as a
 * near duplicate of a posted neighbour? There is no official exemption any
 * more — the exemption only ever existed to defer official items to a second
 * application of this gate, and the decider replaced that.
 * History: docs/decisions.md#stories-as-objects
 *
 * @param {object} subject
 * @param {object} item
 * @param {object|null} nearest   Nearest stored neighbour with its similarity.
 * @returns {string|null}  The claim-link role to hold under, or null to pass.
 */
function checkDuplicateGate(subject, item, nearest) {
  const isDuplicate = Boolean(nearest && nearest.similarity >= FALLBACK_DUP_THRESHOLD);
  if (!isDuplicate) return null;

  console.log(
    `${subject.name}: fallback hold, dup (${nearest.similarity.toFixed(2)} vs "${nearest.title.slice(0, 60)}"): ${item.title.slice(0, 60)}`
  );
  return "echo";
}

/**
 * The body step for one item: decode Google's wrapper, check whether the real
 * URL is already stored, then fetch and extract the article text onto the
 * item. All of it is a bonus — any failure leaves the item headline-only.
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
 * Asks the decider which story this article is. It is shown the subject's
 * closest recent stories and answers join / new / reaction / wrong_subject.
 * Fail-soft: no database, no key, or a thrown call comes back UNSURE and
 * flagged unavailable; a working decider can also answer UNSURE on its own
 * (`decision: null`, not flagged unavailable) — both put the fallback gate
 * in charge, since UNSURE means the same thing either way: no verdict to act on.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} subject
 * @param {object} item
 * @returns {Promise<object>}  The verdict, plus the `stories` shortlist it saw.
 */
async function decideStory(deps, db, subject, item) {
  let decision = { verdict: "UNSURE", decision: null, unavailable: true, stories: [] };

  if (db && deps.matcherEnabled) {
    try {
      // A null embedding (the embedder is down) still gets a shortlist —
      // storyShortlist falls back to recency — so an embedding outage cannot
      // starve the decider into calling everything new.
      const stories = await deps.store.storyShortlist(db, subject.name, item.embedding, { top: STORY_SHORTLIST, days: STORY_WINDOW_DAYS });
      const verdict = await deps.matchItem({
        subject: subject.name, item, stories,
        confusables: subject.confusables, subjectNames: subject.matchNames,
      });
      decision = { ...verdict, stories };
    } catch (err) {
      console.warn(`${subject.name}: decider failed (fallback gate takes over):`, err.message);
    }
  }
  const named = decision.story_id ? ` #${decision.story_id}` : "";
  console.log(
    `${subject.name}: matcher ${decision.decision ?? decision.verdict}${named}: ${item.title.slice(0, 60)}`
  );
  if (decision.reasoning) console.log(`${subject.name}:   because: ${decision.reasoning}`);

  // Recorded on every decider-seen item before any branch returns, so the
  // archive stays re-measurable. Null means we never got an answer.
  item.subjectRole = decision.subject_role ?? null;
  item.newsForFollowers = decision.news_for_followers ?? null;

  return decision;
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
 * Stage 6 — every database write for one classified item, dispatched by what
 * the item turned out to be. On a dry run, or with no database, nothing is
 * written.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} outcome  From classifyItem.
 * @returns {Promise<void>}
 */
async function recordOutcome(deps, db, outcome) {
  if (outcome.kind === "held") return recordHeld(deps, db, outcome);

  // Wrong subject or untrusted source: the row is the audit trail, nothing
  // links to it.
  if (outcome.kind === "wrong-subject" || outcome.kind === "untrusted") {
    outcome.item.dbId = db && !deps.dryRun ? await deps.store.insertItem(db, outcome.item) : null;
    return;
  }

  if (outcome.kind === "match") return recordJoin(deps, db, outcome);
  return recordPost(deps, db, outcome);
}

/**
 * A url duplicate: recorded for audit, never posted, and given its neighbour's
 * story and claim — unless that claim link would drift onto a foreign claim,
 * in which case the hold stands and the item stays unlinked.
 * History: docs/decisions.md#claim-drift-gap
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} outcome
 * @returns {Promise<void>}
 */
async function recordHeld(deps, db, outcome) {
  const { item } = outcome;
  if (!db || deps.dryRun) {
    item.dbId = null;
    return;
  }
  const itemId = await deps.store.insertItem(db, item);
  item.dbId = itemId;
  if (!itemId) return;

  // A same-run twin whose first wrapper was never stored has no neighbour to
  // inherit from; the hold itself still stands.
  if (!outcome.neighborId) return;

  // The same article under another address belongs to the same story.
  const inheritedStoryId = await deps.store.storyOfItem(db, outcome.neighborId);
  if (inheritedStoryId) await deps.store.setItemStory(db, itemId, inheritedStoryId, "join");

  const inheritedClaimId = await deps.store.claimOfItem(db, outcome.neighborId);
  if (!inheritedClaimId) return;
  if (await inheritanceDrifts(deps, db, item, inheritedClaimId)) return;
  await deps.store.linkClaimSource(db, itemId, inheritedClaimId, outcome.role);
}

/**
 * A join: stored on its story, and linked as evidence to that story's claim
 * when the story has one. The item already carries story_id/story_decision.
 * A "match" outcome may gain a `confirmation` here — a rumor an official
 * source just confirmed.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} outcome
 * @returns {Promise<void>}
 */
async function recordJoin(deps, db, outcome) {
  const { item } = outcome;
  item.dbId = null;
  if (!db) return;

  // A dry run previews the confirmation a real run would create, reading the
  // claim without flipping it. Nothing is written.
  // History: docs/decisions.md#dry-run-confirmation-preview
  if (deps.dryRun) {
    if (outcome.claimId && outcome.official && outcome.stance === "asserts") {
      const rumor = await deps.store.claimIfRumor(db, outcome.claimId);
      if (rumor) outcome.confirmation = { text: rumor.canonical_text, replyTo: rumor.tg_message_id, item };
    }
    return;
  }

  const itemId = await deps.store.insertItem(db, item);
  item.dbId = itemId;
  if (itemId && outcome.claimId) {
    await deps.store.linkClaimSource(db, itemId, outcome.claimId,
      outcome.official ? "official" : "echo", outcome.stance);
  }

  // Conservative lifecycle: only an official source that asserts flips
  // rumor -> confirmed. Denials are linked as evidence, never acted on.
  if (outcome.claimId && outcome.official && outcome.stance === "asserts") {
    const confirmed = await deps.store.confirmClaim(db, outcome.claimId);
    if (confirmed) {
      outcome.confirmation = { text: confirmed.canonical_text, replyTo: confirmed.tg_message_id, item };
    }
  }
}

/**
 * A post: the item row, the claim row when the decider minted a real claim,
 * and the story this article opens — rooted at the article itself.
 *
 * @param {object} deps
 * @param {object|null} db
 * @param {object} outcome
 * @returns {Promise<void>}
 */
async function recordPost(deps, db, outcome) {
  const { item } = outcome;
  const itemId = db && !deps.dryRun ? await deps.store.insertItem(db, item) : null;
  item.dbId = itemId;
  if (!itemId) return;

  if (outcome.isRealClaim) {
    // The claim gets its own embedding; a failure just leaves it vector-less.
    let claimVector = null;
    try { claimVector = (await deps.embedTexts([outcome.newClaim.canonical_text]))?.[0] ?? null; } catch {}

    outcome.claimId = await deps.store.insertClaim(db, {
      subject: item.subject, type: outcome.newClaim.type, canonicalText: outcome.newClaim.canonical_text,
      facts: outcome.newClaim.facts, status: outcome.status, embedding: claimVector, embeddingModel: EMBEDDING_MODEL,
    });
    await deps.store.linkClaimSource(db, itemId, outcome.claimId, outcome.official ? "official" : "origin");
  }

  // The story, opened last so it can carry the claim id the mint just
  // returned, and pointed at the story it answers when it is a reaction.
  outcome.storyId = await deps.store.insertStory(db, {
    subject: item.subject, rootItem: itemId, fact: outcome.fact,
    reactsTo: outcome.reactsTo, claimId: outcome.claimId, decidedBy: outcome.decidedBy,
  });
  await deps.store.setItemStory(db, itemId, outcome.storyId, outcome.decision);
}

/**
 * Stage 7 — sorts the recorded outcomes into the messages this run will send,
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
  const tangential = [];    // demoted: queued for the daily mentions digest, not sent here

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

  const postedCount = ceremonies.length + rumorPosts.length + digestItems.length;
  console.log(
    `${subject.name}: ${fetchedCount} fetched, ${outcomes.length} unseen, ${postedCount} posted, ` +
      `${tangential.length} queued for the mentions digest, ${confirmations.length} confirmation(s)`
  );

  // Resend pass: stranded items ride this run's digest as ordinary bullets,
  // rebuilt from the row and deliberately not re-judged.
  // History: docs/decisions.md#resend-pass
  for (const row of resends) {
    // A tangential row that once failed a send belongs to the mentions
    // digest's sweep now, not to this message.
    if (row.digest_tier === "tangential") continue;
    digestItems.push({
      dbId: row.id, title: row.title, source: row.source ?? "",
      url: row.resolved_url ?? row.url, publishedAt: new Date(row.published_at),
      edition: row.edition, resent: true,
    });
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
 * Stage 8 — translates digest headlines the group can't read (claim texts are
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



/** The real article URL, once Google's wrapper has been decoded. */
function articleUrl(item) {
  return item.resolvedUrl ?? item.url;
}

/** An escaped Telegram HTML anchor. */
function anchor(url, label) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}


/**
 * Stage 9 — sends the three message types, in order: standalone ceremonies,
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

  // Nothing but queued mentions this run: nothing to broadcast. Their rows
  // were written posted=false already; the mentions digest sweeps them.
  if (lines.length === 0) {
    if (tangential.length > 0) console.log(`${subject.name}: ${tangential.length} mention(s) queued — nothing broadcast`);
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
    const recovered = digestItems.filter((item) => item.resent).map((item) => item.dbId);
    if (recovered.length) {
      await deps.store.markPosted(db, recovered);
      console.log(`${subject.name}: ${recovered.length} recovered item(s) delivered`);
    }
  }

  // One message carries every line, so one failure loses all of them. The
  // claims stay: a claim is a fact we learned, not a message we sent.
  if (!messageId) {
    await markSendFailed(deps, db, subject,
      [...rumorPosts.map((rumor) => rumor.item), ...digestItems], "digest");
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
    store: realStore,
    sendMessage: sendTelegramMessage,
    mentionsWindowDays: MENTIONS_WINDOW_DAYS,
    backup: (db) => runBackup({ db, store: realStore, fetch, bucket: BACKUP_BUCKET, now: new Date() }),
    backupEnabled: BACKUP_ENABLED,
    backupHourUtc: BACKUP_HOUR_UTC,
    now: () => new Date(),
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

    // Once a day, after the news is out: copy the evidence record to GCS.
    await backupIfDue(mainDeps, db);
  } finally {
    if (db) await db.end();
  }
}

/**
 * The daily mentions digest (`node hunter.js --mentions`): sweeps every
 * tangential row the hourly runs queued, posts one message grouped by
 * fighter, and marks the rows delivered. Nothing queued means nothing sent.
 * History: docs/decisions.md#mentions-digest
 *
 * @param {object} overrides  Test replacements for buildMainDeps.
 * @returns {Promise<void>}
 */
export async function sendMentionsDigest(overrides = {}) {
  const mainDeps = buildMainDeps(overrides);
  if (!mainDeps.dryRun && !mainDeps.chatId) {
    throw new Error("TELEGRAM_CHAT_IDS is required unless DRY_RUN=1");
  }
  if (!mainDeps.databaseUrl) {
    console.warn("No DATABASE_URL — no queue to sweep.");
    return;
  }

  const db = await mainDeps.openDb();
  try {
    const rows = await mainDeps.store.unsweptMentions(db, mainDeps.mentionsWindowDays);
    if (rows.length === 0) {
      console.log("mentions digest: nothing queued");
      return;
    }

    // Watchlist order for the groups; the rows are already newest first.
    const subjects = await mainDeps.loadSubjects();
    const message = renderMentionsDigest(rows, subjects.map((subject) => subject.name));
    console.log(`mentions digest: ${rows.length} queued mention(s)`);

    if (mainDeps.dryRun) {
      console.log(`\n--- would post ---\n${message}\n`);
      return;
    }

    // Delivered rows leave the queue; a failed send leaves them for tomorrow.
    const messageId = await mainDeps.sendMessage(mainDeps.chatId, message, { html: true, noPreview: true });
    if (messageId) {
      await mainDeps.store.markPosted(db, rows.map((row) => row.id));
      console.log(`mentions digest: delivered ${rows.length} mention(s)`);
    } else {
      console.error("mentions digest: send failed, rows stay queued");
    }
  } finally {
    await db.end();
  }
}

/**
 * Runs the daily backup when this hourly run is the one scheduled for it.
 * Needs a real database, a real run, and the backup switched on.
 *
 * @param {object} mainDeps
 * @param {object|null} db
 * @returns {Promise<void>}
 */
async function backupIfDue(mainDeps, db) {
  const isDue = isBackupRun(mainDeps.now(), mainDeps.backupHourUtc);
  const canBackup = db && !mainDeps.dryRun && mainDeps.backupEnabled;
  if (!isDue || !canBackup) return;

  const written = await mainDeps.backup(db);
  if (written) console.log(`backup written: ${written}`);
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

// Run only when executed directly, so tests and scripts can import from this
// module without starting anything: `node hunter.js` hunts, `--mentions`
// sends the daily mentions digest instead.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entry = process.argv.includes("--mentions") ? sendMentionsDigest : main;
  entry().catch(async (err) => {
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
