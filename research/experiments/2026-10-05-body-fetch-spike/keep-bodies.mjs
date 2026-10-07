// Keeps the text of the articles the spike could read, on this machine only:
// bodies/ is git-ignored (other outlets' copyrighted text; see
// docs/decisions.md#article-text-out-of-git). Nothing goes back into any
// database. Each article is fetched again by the way that read it in the spike.
//
//   V0_DATABASE_URL=… node research/experiments/2026-10-05-body-fetch-spike/keep-bodies.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { fetchArticleBody } from "../../../lib/extract.js";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "../../../lib/googlenews.js";

const HERE = new URL(".", import.meta.url).pathname;
const BODIES = `${HERE}bodies/`;
const JINA_GAP_MS = 3_200;

/**
 * Jina Reader's text for a page, as the spike read it.
 *
 * @param {string} url  The article.
 * @returns {Promise<string|null>}  The text after "Markdown Content:", links and images reduced to their words.
 */
async function viaJina(url) {
  const response = await fetch(`https://r.jina.ai/${url}`, { headers: { "X-Timeout": "20" }, signal: AbortSignal.timeout(35_000) }).catch(() => null);
  if (!response?.ok) return null;
  const content = (await response.text()).split("Markdown Content:")[1] ?? "";
  return content.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim() || null;
}

// The articles the spike could read, and how.
const results = JSON.parse(readFileSync(`${HERE}results.json`, "utf8")).filter((row) => row.retry.usable || row.jina?.usable);
const pool = new pg.Pool({ connectionString: process.env.V0_DATABASE_URL });
const urls = new Map((await pool.query("SELECT id, url, production_item_id FROM articles WHERE id = ANY($1)", [results.map((row) => row.id)])).rows.map((row) => [Number(row.id), row]));
await pool.end();
mkdirSync(BODIES, { recursive: true });

let kept = 0;
for (const row of results) {
  const path = `${BODIES}${row.id}.json`;
  if (existsSync(path)) continue;
  const article = urls.get(row.id);

  // The same address the spike used, then the same way of reading it.
  let url = article.url;
  if (isGoogleWrapped(url)) url = (await decodeGoogleNewsUrl(url).catch(() => null)) ?? url;
  const method = row.retry.usable ? "retry" : "jina";
  const text = method === "retry" ? (await fetchArticleBody(url)).body : await viaJina(url);
  if (!text) continue;
  writeFileSync(path, JSON.stringify({ id: row.id, production_item_id: Number(article.production_item_id), outlet: row.outlet, url, fighters: row.fighters, method, fetched_at: new Date().toISOString(), text }, null, 1));
  kept += 1;
  if (method === "jina") await new Promise((resolve) => setTimeout(resolve, JINA_GAP_MS));
}
console.log(`kept ${kept} new bodies; ${results.length} readable in the spike`);
