// Step 3b (E2): Readability's memory per page, run as v0 would: the page's
// window closed after each read, garbage collected between pages. Reports the
// process's peak resident memory and the largest single-page rise.
//
//   node --expose-gc memory.mjs [--golden]

import { readFileSync, readdirSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

const GOLDEN = process.argv.includes("--golden");
const PAGES = GOLDEN ? new URL("../2026-10-20-clean-text/data/pages/", import.meta.url) : new URL("./data/pages/", import.meta.url);

/**
 * Reads every page once and tracks memory.
 */
async function main() {
  let peak = 0;
  let largestRise = 0;
  const baseline = process.memoryUsage().rss;
  for (const file of readdirSync(PAGES)) {
    const html = readFileSync(new URL(file, PAGES), "utf8").slice(0, 1_500_000);
    global.gc();
    const before = process.memoryUsage().rss;
    const dom = new JSDOM(html, { url: "https://example.com/", virtualConsole: new VirtualConsole() });
    new Readability(dom.window.document).parse();
    const after = process.memoryUsage().rss;
    dom.window.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    peak = Math.max(peak, after);
    largestRise = Math.max(largestRise, after - before);
  }
  global.gc();
  const heap = process.memoryUsage();
  console.log(JSON.stringify({ heap_used_end_mb: Math.round(heap.heapUsed / 1e6), external_end_mb: Math.round(heap.external / 1e6), pages: readdirSync(PAGES).length, baseline_mb: Math.round(baseline / 1e6), peak_mb: Math.round(peak / 1e6), largest_rise_mb: Math.round(largestRise / 1e6), end_mb: Math.round(process.memoryUsage().rss / 1e6) }));
}

await main();
