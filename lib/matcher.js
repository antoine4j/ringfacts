// The claim matcher (step 5, docs/architecture-overview.html §5).
// One structured Haiku call per surviving article: which fact is this about —
// or is it a new one, or none, or the wrong person entirely?
// Forced tool use = guaranteed-parseable verdict, no JSON scraping.

import Anthropic from "@anthropic-ai/sdk";

export const MATCHER_MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const VERDICT_TOOL = {
  name: "verdict",
  description: "Report your verdict about this article.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"],
      },
      match_claim_id: {
        type: "integer",
        description: "Required when verdict is MATCH: id of the matched claim",
      },
      stance: {
        type: "string",
        enum: ["asserts", "denies"],
        description: "For MATCH: does the article assert or deny the claim?",
      },
      new_claim: {
        type: "object",
        description: "Required when verdict is NEW",
        properties: {
          type: {
            type: "string",
            enum: ["announcement", "result", "injury", "quote", "negotiation", "lifestyle", "other"],
          },
          canonical_text: {
            type: "string",
            description: "One English sentence stating the fact. Only what the headline supports — no invention.",
          },
          facts: {
            type: "object",
            description: "Structured fields when present: opponent, event, date, location, method",
          },
          sourcing: {
            type: "string",
            enum: ["official", "reported", "rumored"],
            description: "official = promotion announced it; reported = outlet states as fact; rumored = hedged (in talks, targeted, sources say)",
          },
        },
        required: ["type", "canonical_text", "sourcing"],
      },
    },
    required: ["verdict"],
  },
};

function buildPrompt({ fighter, item, candidates }) {
  const candidateList = candidates.length
    ? candidates
        .map((c) => `[${c.id}] (${c.status}, ${c.type}) ${c.canonical_text}`)
        .join("\n")
    : "(none yet)";
  return `You match MMA news articles to known claims about the fighter ${fighter}.

ARTICLE:
Headline: ${item.title}
Source: ${item.source} | Published: ${item.publishedAt.toISOString()} | Found via query: ${item.foundVia ?? "?"}

KNOWN ACTIVE CLAIMS ABOUT ${fighter} (ordered most-similar first):
${candidateList}

Rules:
- MATCH only if the article reports the SAME underlying fact as a listed claim (translations, retellings, syndications of it). Give match_claim_id and stance (asserts/denies).
- A reaction, rebuttal, or follow-up ABOUT a claim is NEW, not MATCH ("X reacts to Y's prediction" is different news from the prediction).
- WRONG_SUBJECT ONLY if the article is not about this fighter AT ALL: a namesake (e.g. an esports driver also named Fighter B), a relative (Fighter C's brother is Ilia's brother — a different fighter), or keyword-stuffed junk with no real connection.
- An article mainly about OTHER fighters or the division that mentions or peripherally involves ${fighter} (as a rival, comparison, or context) is NO_CLAIM — NOT WRONG_SUBJECT. Readers still see NO_CLAIM articles; WRONG_SUBJECT articles are dropped.
- NO_CLAIM also covers articles asserting nothing claim-worthy about ${fighter}'s fights or career (lifestyle, restaurants, vacations, celebrity spotting) — type lifestyle articles are always NO_CLAIM.
- NEW: canonical_text must be ONE English sentence, strictly supported by the headline — NEVER invent details the headline doesn't state. If the headline is too ambiguous to state a fact without guessing, answer UNSURE instead. sourcing reflects the headline's own certainty language.
- UNSURE if you genuinely cannot decide from what you see. Abstaining is better than guessing.`;
}

const VERDICTS = new Set(["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"]);
const CLAIM_TYPES = new Set([
  "announcement", "result", "injury", "quote", "negotiation", "lifestyle", "other",
]);
const SOURCINGS = new Set(["official", "reported", "rumored"]);

// The tool schema's enums are guidance to the model, not a guarantee — a
// Haiku call can still hand back an off-menu type ('prediction', observed
// 2026-08-08) or a MATCH pointing at a claim id that was never offered.
// Unvalidated, the first pollutes the type column and the second throws a
// foreign-key error that kills the rest of that fighter's hunt. So every
// verdict is squeezed through this gate before the pipeline trusts it.
// Every downgrade is toward caution: UNSURE posts the article without
// inventing a claim, and an unreadable `sourcing` can never born-confirm.
export function normalizeVerdict(raw, candidateIds) {
  const unsure = (why) => {
    console.warn(`matcher: verdict downgraded to UNSURE — ${why}`);
    return { verdict: "UNSURE" };
  };
  if (!raw || !VERDICTS.has(raw.verdict)) return unsure(`unknown verdict ${JSON.stringify(raw?.verdict)}`);

  if (raw.verdict === "MATCH") {
    // Only a claim we actually showed the model is a legal match target.
    // Compared as strings on purpose: Postgres bigints arrive from pg as
    // strings ("4") while the model answers with a JSON number (4).
    if (!candidateIds.has(String(raw.match_claim_id))) {
      return unsure(`MATCH on unoffered claim id ${raw.match_claim_id}`);
    }
    return {
      verdict: "MATCH",
      match_claim_id: raw.match_claim_id,
      stance: raw.stance === "denies" ? "denies" : "asserts",
    };
  }

  if (raw.verdict === "NEW") {
    const nc = raw.new_claim;
    if (!nc?.canonical_text?.trim()) return unsure("NEW without canonical_text");
    let { type, sourcing } = nc;
    if (!CLAIM_TYPES.has(type)) {
      console.warn(`matcher: off-enum claim type "${type}" -> other`);
      type = "other";
    }
    if (!SOURCINGS.has(sourcing)) {
      console.warn(`matcher: off-enum sourcing "${sourcing}" -> reported`);
      sourcing = "reported"; // never silently promote junk to official
    }
    return {
      verdict: "NEW",
      new_claim: {
        type, sourcing,
        canonical_text: nc.canonical_text.trim(),
        facts: nc.facts && typeof nc.facts === "object" ? nc.facts : {},
      },
    };
  }

  return { verdict: raw.verdict }; // NO_CLAIM / WRONG_SUBJECT / UNSURE carry no payload
}

// Returns a validated verdict object, e.g. {verdict:"NEW", new_claim:{...}}.
// Throws on API failure — callers treat that as UNSURE (fail-open).
export async function matchItem({ fighter, item, candidates }) {
  const response = await anthropic.messages.create({
    model: MATCHER_MODEL,
    max_tokens: 500,
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "verdict" },
    messages: [{ role: "user", content: buildPrompt({ fighter, item, candidates }) }],
  });
  const call = response.content.find((b) => b.type === "tool_use");
  return normalizeVerdict(call?.input, new Set(candidates.map((c) => String(c.id))));
}
