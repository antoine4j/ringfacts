// Step 4: Jina Reader, keyless, on every sampled article, the refused ones
// included: given an address, Jina downloads the page from its own servers.
// One call started every 3.2 seconds keeps under the keyless limit of 20 a minute.
// Free; no key.
//
//   node jina.mjs             # the fresh sample
//   node jina.mjs --golden    # the golden articles, at the address the clean-text experiment fetched
//
// Writes data/[golden-]jina.json (each article's text, git-ignored) and
// data/[golden-]jina-record.json (status, length, milliseconds).

import { readFileSync, writeFileSync } from "node:fs";

const GAP_MS = 3_200;
const GOLDEN = process.argv.includes("--golden");

/**
 * Jina's text for one page: the part after "Markdown Content:", links and images reduced to their words.
 *
 * @param {string} address  The article.
 * @returns {Promise<{text: string|null, status: string, ms: number}>}
 */
async function viaJina(address) {
  const started = Date.now();
  try {
    const response = await fetch(`https://r.jina.ai/${address}`, { headers: { "X-Timeout": "20" }, signal: AbortSignal.timeout(35_000) });
    const raw = await response.text();
    if (!response.ok) return { text: null, status: `jina-${response.status}`, ms: Date.now() - started };
    const warning = raw.match(/^Warning: (.*)$/m)?.[1] ?? null;
    const content = raw.split("Markdown Content:")[1] ?? "";
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return { text: text || null, status: warning ? `warning: ${warning.slice(0, 80)}` : "ok", ms: Date.now() - started };
  } catch (error) {
    return { text: null, status: `error-${error.name}`, ms: Date.now() - started };
  }
}

/**
 * Calls Jina for every sampled article: one call started every 3.2 seconds,
 * several in flight at once, since a call can take half a minute.
 */
async function main() {
  const sample = JSON.parse(readFileSync(new URL(GOLDEN ? "../../../golden/articles.json" : "./data/sample.json", import.meta.url), "utf8"));
  const fetched = JSON.parse(readFileSync(new URL(GOLDEN ? "../2026-10-20-clean-text/data/fetch.json" : "./data/fetch.json", import.meta.url), "utf8"));
  const texts = {};
  const record = {};
  const calls = [];
  for (const article of sample) {
    const address = fetched[article.id]?.address ?? article.resolved_url ?? article.url;
    calls.push(
      viaJina(address).then((result) => {
        texts[article.id] = result.text;
        record[article.id] = { status: result.status, chars: result.text?.length ?? 0, ms: result.ms };
        console.log(article.id, result.status, record[article.id].chars, result.ms);
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  await Promise.all(calls);
  const name = GOLDEN ? "golden-" : "";
  writeFileSync(new URL(`./data/${name}jina.json`, import.meta.url), JSON.stringify(texts));
  writeFileSync(new URL(`./data/${name}jina-record.json`, import.meta.url), JSON.stringify(record, null, 1));
}

await main();
