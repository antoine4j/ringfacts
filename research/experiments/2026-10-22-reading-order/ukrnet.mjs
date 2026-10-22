// Step 6 (E10): Ukr.net is an aggregator; its page shows a summary and a link
// to the outlet that wrote the story. For each sampled Ukr.net article, find
// that link, fetch the original page, and read it with our extractor and
// Readability. Also: does the original's slug match another sampled article
// (then it is a copy the seen check would catch anyway)?
//
//   node ukrnet.mjs
//
// Writes data/ukrnet.json (addresses, statuses, lengths, verdicts; no text).

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { extractFromHtml } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { slugOf } from "../2026-10-22-addresses/slugs.mjs";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NOT_ARTICLES = /ukr\.net|fwdcdn\.com|\.(png|jpe?g|gif|ico|svg|css|js|webp)(\?|$)/i;

/**
 * The original outlet's address on a Ukr.net page: the first outside link that is not an image or a script.
 *
 * @param {string} html
 * @returns {string|null}
 */
function originalLink(html) {
  for (const [, href] of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    if (!NOT_ARTICLES.test(href)) return href;
  }
  return null;
}

/**
 * Whether a text passes the readable bar for a fighter.
 *
 * @param {string|null} text
 * @param {string} fighter
 * @returns {boolean}
 */
function readable(text, fighter) {
  const names = SUBJECTS.find((subject) => subject.name === fighter)?.matchNames ?? [];
  return Boolean(text) && text.length >= 400 && mentionsName(text, names);
}

/**
 * Follows each sampled Ukr.net article to its original.
 */
async function main() {
  const sample = JSON.parse(readFileSync(new URL("./data/sample.json", import.meta.url), "utf8"));
  const fetched = JSON.parse(readFileSync(new URL("./data/fetch.json", import.meta.url), "utf8"));
  const sampleSlugs = new Map(sample.map((article) => [slugOf(fetched[article.id]?.address ?? ""), article.id]));
  const record = {};
  for (const article of sample.filter((row) => (fetched[row.id]?.address ?? "").includes("ukr.net"))) {
    const html = readFileSync(new URL(`./data/pages/${article.id}.html`, import.meta.url), "utf8");
    const original = originalLink(html);
    const row = { original, host: original ? new URL(original).host : null, copy_of: original ? (sampleSlugs.get(slugOf(original)) ?? null) : null };
    if (original) {
      try {
        const response = await fetch(original, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(10_000) });
        row.status = response.status;
        if (response.ok) {
          const page = await response.text();
          const ours = extractFromHtml(page).text;
          const dom = new JSDOM(page, { url: original, virtualConsole: new VirtualConsole() });
          const parsed = new Readability(dom.window.document).parse();
          dom.window.close();
          row.ours = readable(ours, article.subject);
          row.readability = readable(parsed?.textContent?.replace(/\s+/g, " ").trim() ?? null, article.subject);
        }
      } catch (error) {
        row.status = `error-${error.name}`;
      }
    }
    record[article.id] = row;
    console.log(article.id, row.host, row.status, row.ours, row.readability, row.copy_of);
  }
  writeFileSync(new URL("./data/ukrnet.json", import.meta.url), JSON.stringify(record, null, 1));
}

await main();
