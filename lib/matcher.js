// The story matcher (step 5, docs/architecture-overview.html §5).
// One structured Haiku call per surviving article: does it join a story we
// already know, open a new one, react to one, or is it the wrong person?
// Forced tool use = guaranteed-parseable verdict, no JSON scraping.
//
// History: docs/decisions.md#stories-as-objects

import Anthropic from "@anthropic-ai/sdk";
import { htmlToText } from "./extract.js";
import { domain } from "../domain/index.js";

// MATCHER_MODEL in the environment overrides the model — for the bench only
// (a ceiling test on a stronger model, 2026-09-04); the deployed job carries
// no plain env vars, so production always runs the default.
export const MATCHER_MODEL = process.env.MATCHER_MODEL || "claude-haiku-4-5-20251001";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const P = domain.prompt;

export const VERDICT_TOOL = {
  name: "verdict",
  description: "Report your verdict about this article.",
  input_schema: {
    type: "object",
    properties: {
      // First on purpose: the model fills tool fields in schema order, and a
      // forced tool call otherwise gives it no room to think before it must
      // decide. 2026-09-04: with reasoning room it called a fight result NEW;
      // without, the same prompt folded it into the booking.
      reasoning: {
        type: "string",
        description: "One or two sentences, written BEFORE the decision: what this article's own news is, and whether a listed story already IS that news.",
      },
      decision: {
        type: "string",
        enum: ["join", "new", "reaction", "wrong_subject"],
        description: "join: the same news as a listed story (a repeat, translation, retelling, or another passage of the same interview or statement). new: news no listed story has. reaction: someone ELSE replying to, rebutting or following up a listed story — its own news, connected to that story. wrong_subject: not about this person at all.",
      },
      subject_role: {
        type: "string",
        enum: ["central", "supporting", "passing"],
        description: "How prominent the subject is in the article's own text. Always report this, whatever the decision.",
      },
      news_for_followers: {
        type: "string",
        enum: ["yes", "no"],
        description: "Would a follower of the subject learn something new about him from this article? Always report this, whatever the decision.",
      },
      story_id: {
        type: "integer",
        description: "For join and reaction: the id of the listed story.",
      },
      stance: {
        type: "string",
        enum: ["asserts", "denies"],
        description: "For join: does the article assert or deny the story's fact?",
      },
      fact: {
        type: "string",
        description: "For new and reaction: ONE English sentence stating this article's news, naming the subject. Only what the text supports — no invention.",
      },
      claim: {
        type: "object",
        description: "For new and reaction, when the fact is a claim about the subject's career (a booking, result, injury, negotiation, quote, prediction, lifestyle piece, or other statement). Omit when the article asserts nothing claim-worthy about the subject.",
        properties: {
          type: {
            type: "string",
            enum: domain.claimTypes,
          },
          facts: {
            type: "object",
            description: `Structured fields when present: ${P.factFields}`,
          },
          sourcing: {
            type: "string",
            enum: ["official", "reported", "rumored"],
            description: P.sourcingHint,
          },
        },
        required: ["type", "sourcing"],
      },
    },
    required: ["reasoning", "decision", "subject_role", "news_for_followers"],
  },
};

/**
 * The two turns of one matcher call: the stable rules, and this article.
 * The split is what lets the rules be cached — they are identical for every
 * article about the same subject, and they are most of the tokens.
 *
 * @param {object} args
 * @param {string} args.subject           the watched subject's name
 * @param {object} args.item              the article
 * @param {object[]} args.stories         storyShortlist rows, most similar first
 * @param {string} [args.confusables]     per-subject disambiguation hints
 * @param {boolean} [args.fightWeekShape] include the fight-week angle rules
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt({ subject, item, stories, confusables = P.confusables, fightWeekShape = true }) {
  return {
    system: STORY_RULES(subject, confusables, fightWeekShape),
    user: `${articleBlock(item)}
KNOWN STORIES ABOUT ${subject} FROM THE LAST 7 DAYS (most similar first):
${storyLines(stories)}`,
  };
}

/**
 * The article's own block: what the model is judging.
 * Evidence beyond the headline, best available (2e) — a body excerpt when we
 * have one; else Google's related-coverage cluster (headlines of stories
 * Google groups with this one — weaker, but it exists for the old archive).
 *
 * @param {object} item
 * @returns {string}
 */
function articleBlock(item) {
  const body = item.body ? `\nBody excerpt (start of the article, may be truncated):\n${item.body.slice(0, 1200)}\n` : null;
  const related = item.rssDescription
    ? `\nRelated coverage (headlines Google clusters with this story — secondary evidence, not the article itself):\n${htmlToText(item.rssDescription).slice(0, 500)}\n`
    : "";
  const context = body ?? related;

  return `ARTICLE:
Headline: ${item.title}
Source: ${item.source} | Published: ${item.publishedAt.toISOString()} | Found via query: ${item.foundVia ?? "?"}
${context}`;
}

/**
 * The shortlist as the model reads it: one line per story, with the root's
 * headline and how many articles are already on it.
 *
 * @param {object[]} stories  storyShortlist rows
 * @returns {string}
 */
function storyLines(stories) {
  if (!stories?.length) return "(none)";
  const lines = [];

  // Stories whose claim describes a fight BEFORE it happens are marked at the
  // point of decision, so a result article is not read as "the prediction
  // came true" (the model's own words, 2026-09-04).
  for (const story of stories) {
    const count = `${story.members} article${Number(story.members) === 1 ? "" : "s"}`;
    const isBooking = P.bookingTypes?.includes(story.claim_type);
    const booking = isBooking ? " " + P.bookingNote : "";
    lines.push(`[${story.id}] ${story.fact} (${count}, first: "${story.root_title}")${booking}`);
  }

  return lines.join("\n");
}

/**
 * The stable block: everything that does not change from article to article,
 * sent as a cached system prompt.
 *
 * `confusables` are the disambiguation hints for THIS subject — namesakes,
 * relatives, anyone the model might confuse them with. Per-subject, because a
 * hint about one subject's brother is noise for everyone else.
 *
 * @param {string} subject
 * @param {string} confusables
 * @param {boolean} fightWeekShape
 * @returns {string}
 */
export function STORY_RULES(subject, confusables = P.confusables, fightWeekShape = true) {
  const fightWeek = fightWeekShape ? `\n${P.fightWeekShape}\n` : "";

  return `You sort ${P.domainNoun} news articles about the ${P.subjectNoun} ${subject} into stories. A story is one piece of news; every article that reports that same news belongs to it, whatever the outlet, language or wording. A reaction to a story (someone replying, a coach commenting, a rival answering a callout) is its own story, connected to the one it answers.

Deciding where the article goes:
- join only when the article reports the SAME news as a listed story. Same interview, same quote, same announcement, same result — join, even if the headline picks a different sentence from it. Give story_id and stance (asserts/denies).
- Different remarks by the same person on different occasions are different stories. A story about a fight and a reaction to that fight are different stories.
- reaction when someone ELSE responds to a listed story — a reply, a rebuttal or a follow-up. Give the story_id it answers, and write this article's own fact.
- new when no listed story is this news. Write the fact as one plain sentence.
- Read the next rule with "MATCH" meaning join and "NEW" meaning a story of its own: ${P.sameFactGuide}
${fightWeek}
Deciding it is the wrong person:
- wrong_subject ONLY if the article is not about this ${P.subjectNoun} AT ALL: ${confusables}, or keyword-stuffed junk with no real connection. Judge on EVERYTHING shown: a body that clearly concerns ${subject} overrides a headline that never names them.
- wrong_subject also when ${subject} appears NOWHERE in the headline or body excerpt shown — or only inside site furniture (a "LATEST NEWS"/related-articles link list, a photo caption, a navigation block). Such an article merely sits NEXT TO news about them; it is not about them.
- An article mainly about OTHER ${P.peerPlural} or the ${P.peerGroupNoun} whose OWN TEXT mentions or peripherally involves ${subject} (as a rival, comparison, or context) is new with NO claim — NOT wrong_subject. Readers still see articles with no claim; wrong_subject articles are dropped.

The fact, and the claim:
- The fact must be ONE English sentence ABOUT ${subject}, naming ${subject}, strictly supported by the headline and body excerpt shown — NEVER invent details they don't state.
- Omit the claim entirely when the article asserts nothing claim-worthy about ${subject}'s ${P.careerNoun} (${P.offTopicExamples}); ${domain.ignoredTypes.join("/")} articles never carry a claim. A fact whose subject is another ${P.subjectNoun} (their fight, their injury, their booking) is not a claim about ${subject}: write the fact, omit the claim.
- The claim's sourcing reflects the article's own certainty language.
- Claim types, and how strictly each is meant. The types ${domain.loudTypes.join("/")} raise an alert to readers, so they require a concrete, new event about ${subject} personally, stated in the text shown; when torn between one of them and quote/other, choose quote/other.
${P.claimTypeGuide.map((line) => `  · ${line}`).join("\n")}

The two axes reported on every article:
- ALWAYS report subject_role, judged independently of the decision: "central" if the article is primarily about ${subject}; "supporting" if they genuinely act in the story (quoted, a participant in its events); "passing" if they are named only as background color — a comparison, an opponent's teammate or cornerman, a ranking mention — in an article about someone or something else. ${P.roleGuide}
- ALWAYS report news_for_followers: ${P.newsGuide} Examples, from the readers' own rulings:
${P.newsExamples.map(([what, answer]) => `  · ${what} → ${answer}`).join("\n")}`;
}

const DECISIONS = new Set(["join", "new", "reaction", "wrong_subject"]);
// Derived from the same list the tool schema advertises, so the menu offered
// to the model and the gate it is judged against cannot drift apart. They
// were separate literals until 2026-08-09; an edit to one silently coerced
// every verdict of the new type to "other".
const CLAIM_TYPES = new Set(domain.claimTypes);
const SOURCINGS = new Set(["official", "reported", "rumored"]);
const ROLES = new Set(["central", "supporting", "passing"]);
const NEWS = new Set(["yes", "no"]);

/**
 * Squeezes one raw tool answer into the shape the pipeline trusts.
 *
 * The tool schema's enums are guidance to the model, not a guarantee — a
 * Haiku call can still hand back an off-menu claim type ('prediction',
 * observed 2026-08-08) or a story id that was never offered. Unvalidated, the
 * first pollutes the type column and the second throws a foreign-key error
 * that kills the rest of that subject's hunt. Every downgrade here is toward
 * caution: UNSURE posts the article without inventing anything, and an
 * unreadable `sourcing` can never born-confirm.
 *
 * @param {object|null|undefined} raw       the tool call's input
 * @param {Set<string>} offeredStoryIds     ids we actually showed the model
 * @param {{ subjectNames?: string[]|null, publishedAt?: Date|null }} [options]
 * @returns {object}  { verdict, decision, subject_role, news_for_followers, ... }
 *
 * History: docs/decisions.md#stories-as-objects
 */
export function normalizeVerdict(raw, offeredStoryIds, { subjectNames = null, publishedAt = null } = {}) {
  const axes = {
    subject_role: normalizeEnum(raw?.subject_role, ROLES, "subject role"),
    news_for_followers: normalizeEnum(raw?.news_for_followers, NEWS, "news_for_followers"),
  };
  const unsure = (why) => {
    console.warn(`matcher: verdict downgraded to UNSURE — ${why}`);
    return { verdict: "UNSURE", decision: null, ...axes, story_id: null, fact: null };
  };

  if (!raw || !DECISIONS.has(raw.decision)) return unsure(`unknown decision ${JSON.stringify(raw?.decision)}`);
  if (raw.decision === "wrong_subject") {
    return { verdict: "WRONG_SUBJECT", decision: "wrong_subject", ...axes, story_id: null, fact: null };
  }

  // Only a story we actually showed the model is a legal target; an unoffered
  // story is no story, so the article opens one of its own instead. Compared
  // as strings on purpose: Postgres bigints arrive from pg as strings ("4")
  // while the model answers with a JSON number (4).
  let decision = raw.decision;
  let storyId = raw.story_id ?? null;
  if (decision !== "new" && !offeredStoryIds.has(String(storyId))) {
    console.warn(`matcher: "${decision}" on unoffered story id ${storyId} -> new`);
    decision = "new";
    storyId = null;
  }

  if (decision === "join") {
    return {
      verdict: "MATCH",
      decision: "join",
      ...axes,
      story_id: storyId,
      stance: raw.stance === "denies" ? "denies" : "asserts",
      fact: null,
    };
  }

  // new and reaction both open a story, so both need its one sentence.
  const fact = typeof raw.fact === "string" ? raw.fact.trim() : "";
  if (!fact) return unsure(`"${decision}" without a fact`);
  const story = { decision, ...axes, story_id: decision === "reaction" ? storyId : null, fact };

  // A story without a claim is still a story: the article is posted, nothing
  // is filed against the claims table.
  if (!raw.claim || typeof raw.claim !== "object") return { verdict: "NO_CLAIM", ...story };
  const claim = gateClaim({ ...raw.claim, canonical_text: fact }, { subjectNames, publishedAt });
  if (!claim) return { verdict: "NO_CLAIM", ...story };
  return { verdict: "NEW", ...story, new_claim: claim };
}

/**
 * Runs every claim gate over one proposed claim.
 *
 * @param {object} claim   the model's claim, with canonical_text set to the story fact
 * @param {{ subjectNames: string[]|null, publishedAt: Date|null }} options
 * @returns {object|null}  the cleaned claim, or null when a gate drops it
 */
function gateClaim(claim, { subjectNames, publishedAt }) {
  // A claim FOR the subject names the subject. The model has minted "injury"
  // for an opponent's broken hands and "result" for another fighter's win
  // with the subject as scenery (graded month, 2026-09-04); a sentence that
  // never names them is a fact about someone else.
  if (subjectNames?.length && !namesAnyOf(claim.canonical_text, subjectNames)) {
    console.warn(`matcher: claim does not name the subject -> NO_CLAIM: "${claim.canonical_text.slice(0, 80)}"`);
    return null;
  }

  // A result is news for days, not months. The model restates the subject's
  // last loss as a "result" whenever an August article mentions June (graded
  // month, 2026-09-04). No date, or an unreadable one, passes — the gate only
  // acts on evidence.
  if (claim.type === "result" && publishedAt && isStaleResult(claim.facts?.date, publishedAt)) {
    console.warn(`matcher: "result" dated ${claim.facts.date} in an article of ${publishedAt.toISOString().slice(0, 10)} -> NO_CLAIM`);
    return null;
  }

  return {
    type: gateClaimType(claim),
    sourcing: gateSourcing(claim.sourcing),
    canonical_text: claim.canonical_text,
    facts: claim.facts && typeof claim.facts === "object" ? claim.facts : {},
  };
}

/**
 * The claim's type, after the three demotions that keep the loud types loud.
 *
 * @param {object} claim
 * @returns {string}  a type from domain.claimTypes
 */
function gateClaimType(claim) {
  let type = claim.type;
  if (!CLAIM_TYPES.has(type)) {
    console.warn(`matcher: off-enum claim type "${type}" -> other`);
    type = "other";
  }

  // An announcement is a specific fight: it names an opponent, or an event or
  // date. "Topuria announces his return to the UFC" (2026-09-04, claim #51)
  // carried none of those, was born confirmed on the fighter's own words, and
  // fired the 🚨 Fight-announced ceremony for a fight that does not exist.
  if (type === domain.ceremonyType && !hasAnnouncementFacts(claim.facts)) {
    console.warn(`matcher: "${type}" with no opponent, event or date -> other: "${claim.canonical_text.slice(0, 80)}"`);
    type = "other";
  }

  // The mirror of the stale gate: a result the stale gate cannot judge is not
  // checkable, so it is demoted — still a claim, never an alert.
  if (type === "result" && !hasResultDate(claim.facts?.date)) {
    console.warn(`matcher: "result" with no fight date -> other: "${claim.canonical_text.slice(0, 80)}"`);
    type = "other";
  }

  return type;
}

/**
 * The claim's sourcing, never silently promoted to official.
 *
 * @param {unknown} sourcing
 * @returns {string}
 */
function gateSourcing(sourcing) {
  if (SOURCINGS.has(sourcing)) return sourcing;
  console.warn(`matcher: off-enum sourcing "${sourcing}" -> reported`);
  return "reported";
}

/**
 * One of the two independent axes, or null when the model answered junk.
 * Junk in an axis can only null that axis; it never touches the decision,
 * because a model that misjudged prominence has not thereby misjudged the
 * fact. Absent is not an error worth logging.
 *
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @param {string} label   what to call it in the warning
 * @returns {string|null}
 */
function normalizeEnum(value, allowed, label) {
  if (value === null || value === undefined) return null;
  if (allowed.has(value)) return value;
  console.warn(`matcher: off-enum ${label} "${value}" -> null`);
  return null;
}

/**
 * Whether a claim's facts pin a fight down: an opponent, an event, or a
 * date, each a non-empty string.
 *
 * @param {object|undefined} facts
 * @returns {boolean}
 */
export function hasAnnouncementFacts(facts) {
  if (!facts || typeof facts !== "object") return false;
  return ["opponent", "event", "date"].some((key) => typeof facts[key] === "string" && facts[key].trim().length > 0);
}

/**
 * Whether a result claim carries a fight date the gates can read:
 * YYYY-MM or YYYY-MM-DD, as the prompt asks for. A bare year is not enough.
 *
 * @param {unknown} date
 * @returns {boolean}
 */
export function hasResultDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}(-\d{2})?/.test(date);
}

// How long a fight's outcome stays a "result" rather than history.
const RESULT_MAX_AGE_DAYS = 14;

/**
 * Whether a result claim's fight date sits more than RESULT_MAX_AGE_DAYS
 * before the article. Reads YYYY-MM-DD and YYYY-MM (taken as the 1st); any
 * other shape is "no evidence" and returns false.
 *
 * @param {string|undefined} date   the claim's facts.date
 * @param {Date} publishedAt
 * @returns {boolean}
 */
export function isStaleResult(date, publishedAt) {
  const match = typeof date === "string" && date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return false;
  const fought = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1));
  if (Number.isNaN(fought)) return false;
  return publishedAt.getTime() - fought > RESULT_MAX_AGE_DAYS * 86_400_000;
}

/**
 * Whether the text names the subject by any of the watchlist's match names
 * (surname stems in Latin and Cyrillic), case-insensitively.
 *
 * @param {string} text
 * @param {string[]} names
 * @returns {boolean}
 */
function namesAnyOf(text, names) {
  const lower = text.toLowerCase();
  return names.some((name) => lower.includes(name.toLowerCase()));
}

// Tokens spent by every matchItem call in this process, so a bench run can
// report what it cost. Read with usageTotals(); nothing in the pipeline
// reads it.
const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * A copy of the running token count for this process.
 *
 * @returns {{ calls: number, inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number }}
 */
export function usageTotals() {
  return { ...usage };
}

/**
 * Asks the model where one article belongs, and returns a validated verdict.
 * Throws on API failure — callers treat that as UNSURE (fail-open).
 *
 * @param {object} args
 * @param {string} args.subject
 * @param {object} args.item
 * @param {object[]} args.stories          the shortlist, most similar first
 * @param {string|null} [args.confusables]
 * @param {string[]|null} [args.subjectNames]
 * @param {boolean} [args.fightWeekShape]
 * @returns {Promise<object>}
 */
export async function matchItem({ subject, item, stories, confusables, subjectNames = null, fightWeekShape = true }) {
  // `confusables ?? undefined` so an entry without hints falls through to
  // buildPrompt's domain default rather than interpolating a null.
  const { system, user } = buildPrompt({ subject, item, stories, confusables: confusables ?? undefined, fightWeekShape });
  const response = await anthropic.messages.create({
    model: MATCHER_MODEL,
    max_tokens: 500,
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "verdict" },
    // The rules are identical for every article about this subject, so they
    // are cached: a run of ten items pays for them once.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });

  usage.calls++;
  usage.inputTokens += response.usage?.input_tokens ?? 0;
  usage.outputTokens += response.usage?.output_tokens ?? 0;
  usage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0;
  usage.cacheWriteTokens += response.usage?.cache_creation_input_tokens ?? 0;

  const call = response.content.find((block) => block.type === "tool_use");
  const offeredStoryIds = new Set(stories.map((story) => String(story.id)));
  const verdict = normalizeVerdict(call?.input, offeredStoryIds, { subjectNames, publishedAt: item.publishedAt });
  // Carried for the log line only: the hunter prints it so a live verdict can
  // be audited without re-running the model. Not stored.
  if (typeof call?.input?.reasoning === "string") verdict.reasoning = call.input.reasoning.slice(0, 300);
  return verdict;
}
