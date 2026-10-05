// Claim extractor (5): the pass-4 prompt on Qwen3.8 Flash through OpenRouter,
// whole body, temperature 0, reasoning off. No database.
// The prompt is the file that wrote the 300 golden extracts
// (experiments/2026-09-20-claim-extraction/prompt-p4.md); the call is that
// experiment's run.py, line for line.

import { readFileSync } from "node:fs";
import { z } from "zod";

export const EXTRACTOR_VERSION = "p4";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const EXTRACTOR_MODEL = "qwen/qwen3.8-flash";
export const PROMPT = readFileSync(new URL("./prompt-p4.md", import.meta.url), "utf8");

// The model sometimes leaves a detail field out (2 of 195 golden extracts); a missing one is stored as null.
const DETAIL = z.string().nullish().transform((value) => value ?? null);

/** The extract of pass 4: the shape every stored row must have. */
export const ExtractP4 = z.object({
  kind: z.enum(["new_event", "new_remark", "reaction", "analysis", "restatement", "about_someone_else", "no_text"]),
  claim: z.string().min(1),
  occasion: DETAIL,
  actor: DETAIL,
  opponent: DETAIL,
  event: DETAIL,
  date: DETAIL,
});
export type Extract = z.infer<typeof ExtractP4>;

/** What the extractor is shown of one reading. */
export type ExtractorInput = { fighter: string; headline: string; outlet: string; publishedAt: Date; body: string };

/**
 * One section of the prompt file, under its "## " heading.
 *
 * @param name  "System" or "User".
 * @returns The section's text, trimmed.
 */
export function promptSection(name: string): string {
  const match = PROMPT.match(new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  if (!match) throw new Error(`prompt-p4.md has no "## ${name}" section`);
  return match[1].trim();
}

/**
 * The user message for one reading: the template with the article filled in.
 *
 * @param input  The fighter and the article.
 * @returns The message.
 */
export function userMessage(input: ExtractorInput): string {
  return promptSection("User")
    .replaceAll("{subject}", input.fighter)
    .replaceAll("{title}", input.headline)
    .replaceAll("{source}", input.outlet)
    .replaceAll("{date}", input.publishedAt.toISOString().slice(0, 10))
    .replaceAll("{body}", input.body);
}

/**
 * Asks the model for one reading's extract.
 *
 * @param input  The fighter and the article.
 * @param apiKey  v0's OpenRouter key.
 * @returns The extract, checked against the pass-4 shape, and the model's whole reply.
 */
export async function extract(input: ExtractorInput, apiKey: string): Promise<{ answers: Extract; raw: unknown }> {
  const request = {
    model: EXTRACTOR_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    reasoning: { enabled: false },
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: "system", content: promptSection("System") },
      { role: "user", content: userMessage(input) },
    ],
  };
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "ringfacts-v0" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const raw = await response.json();
  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter reply had no message");
  return { answers: ExtractP4.parse(JSON.parse(content)), raw };
}
