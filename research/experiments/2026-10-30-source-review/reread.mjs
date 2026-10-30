// Step 4: an answering page is not a read page. For every probed outlet whose
// article page answered in step 3, fetches that same article once more with
// production's own reader (lib/extract.js fetchArticleBody: same headers,
// 10-second limit) and checks v0's readable bar (400 characters naming the
// article's fighter). One request per outlet, one second apart.
//
//   node reread.mjs
//
// Reads data/targets.json, data/items.json and results.json ("probes").
// Writes results.json ("reread") and data/reread.json (the texts: git-ignored).

import { readFileSync, writeFileSync } from "node:fs";
import { fetchArticleBody } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { saveResults } from "./load.mjs";

const PAUSE_MS = 1_000;

/**
 * Reads a JSON file from this folder.
 *
 * @param {string} name  Path relative to this folder.
 * @returns {any}
 */
function readJson(name) {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
}

/**
 * Re-reads each answering article and records the rung and the verdict.
 */
async function main() {
  const targets = readJson("data/targets.json");
  const items = readJson("data/items.json");
  const probes = readJson("results.json").probes;
  const outcomes = [];
  const texts = {};

  for (const target of targets) {
    // Only articles whose page answered in step 3 are worth a second look.
    const probed = probes.find((outcome) => outcome.host === target.host);
    const answered = typeof probed.article?.status === "number" && probed.article.status < 400;
    if (!answered) continue;

    // Production's reader on the page, then the readable bar for the article's own fighter.
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    const subject = items.find((item) => item.id === target.article_id).subject;
    const matchNames = SUBJECTS.find((entry) => entry.name === subject).matchNames;
    const { body, via } = await fetchArticleBody(target.article);
    const readable = Boolean(body) && body.length >= 400 && mentionsName(body, matchNames);
    outcomes.push({ host: target.host, article_id: target.article_id, subject, via, chars: body?.length ?? 0, readable });
    texts[target.article_id] = body;
    console.log(`${target.host} #${target.article_id}: ${via}, ${body?.length ?? 0} chars, ${readable ? "readable" : "not readable"}`);
  }

  writeFileSync(new URL("./data/reread.json", import.meta.url), JSON.stringify(texts, null, 1));
  saveResults("reread", outcomes);
}

await main();
