// Step 2: replays the architecture's health rule day by day over production's
// record. For each fighter and each day: the articles found and the articles
// with readable text in the window that ends that day; a verdict only when the
// window holds at least the minimum number of articles; the verdict is "under
// the floor" when the readable share is below it. Also the weekly article
// counts the comparison week (10.8) would have had to work with.
//
//   node replay.mjs
//
// Reads data/articles.json (written by pull.mjs). Writes results.json (counts
// and dates only) and prints the tables the README quotes.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./pull.mjs";

const FIGHTERS = ["Yaroslav Amosov", "Daniil Donchenko", "Ilia Topuria"];
const WINDOWS_DAYS = [30, 60, 90];
const MINIMUMS = [10, 20];
// The architecture's starting threshold: alert when the readable share is under this.
const FLOOR = 0.75;
// The architecture's "no article found for a fighter" alert.
const SILENCE_ALERT_DAYS = 7;
const WEEK_DAYS = 7;
const ARTICLES_NEEDED = 20;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Every date from `first` to `last`, as YYYY-MM-DD strings.
 *
 * @param {string} first
 * @param {string} last
 * @returns {string[]}
 */
function daysBetween(first, last) {
  const days = [];
  const end = Date.parse(last);
  for (let time = Date.parse(first); time <= end; time += MILLISECONDS_PER_DAY) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * For one fighter, the articles found and the readable ones on each day.
 *
 * @param {{subject: string, seen_day: string, readable: boolean}[]} articles
 * @param {string} fighter
 * @param {string[]} days
 * @returns {{found: number[], readable: number[]}}  One entry per day, in day order.
 */
function dailyCounts(articles, fighter, days) {
  const index = new Map(days.map((day, position) => [day, position]));
  const found = days.map(() => 0);
  const readable = days.map(() => 0);
  for (const article of articles) {
    if (article.subject !== fighter) continue;
    const position = index.get(article.seen_day);
    found[position] += 1;
    if (article.readable) readable[position] += 1;
  }
  return { found, readable };
}

/**
 * Sum of `values` over the `length` entries that end at `endIndex`.
 *
 * @param {number[]} values
 * @param {number} endIndex
 * @param {number} length
 * @returns {number}
 */
function windowSum(values, endIndex, length) {
  let total = 0;
  for (let index = endIndex - length + 1; index <= endIndex; index += 1) total += values[index];
  return total;
}

/**
 * Lengths of the runs of `true` in a list, with the index each run starts at.
 *
 * @param {boolean[]} flags
 * @returns {{start: number, length: number}[]}
 */
function runsOfTrue(flags) {
  const runs = [];
  let start = null;
  for (let index = 0; index <= flags.length; index += 1) {
    const isOn = index < flags.length && flags[index];
    if (isOn && start === null) start = index;
    if (!isOn && start !== null) {
      runs.push({ start, length: index - start });
      start = null;
    }
  }
  return runs;
}

/**
 * The value at a fraction of the way through a sorted copy of the list.
 *
 * @param {number[]} values
 * @param {number} fraction  0 for the smallest, 0.5 for the median, 1 for the largest.
 * @returns {number|null}
 */
function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

/**
 * Rounds to a given number of decimals.
 *
 * @param {number|null} value
 * @param {number} decimals
 * @returns {number|null}
 */
function round(value, decimals) {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * How many days before `endIndex` the fighter's latest article was found (0 if that day had one).
 *
 * @param {number[]} found  Articles found per day.
 * @param {number} endIndex
 * @returns {number}
 */
function daysSinceLastArticle(found, endIndex) {
  let index = endIndex;
  while (index > 0 && found[index] === 0) index -= 1;
  return endIndex - index;
}

/**
 * Replays the rule for one fighter at one window length and one minimum.
 *
 * @param {{found: number[], readable: number[]}} counts
 * @param {string[]} days
 * @param {number} windowDays
 * @param {number} minimum
 * @returns {object}  Days judged, days with a verdict, the verdicts, and the silent stretches.
 */
function replayRule(counts, days, windowDays, minimum) {
  const firstFullWindow = windowDays - 1;
  const judged = [];
  const shares = [];
  const newestAgesOnVerdictDays = [];
  const hasVerdict = [];
  const isUnderFloor = [];
  for (let index = firstFullWindow; index < days.length; index += 1) {
    const found = windowSum(counts.found, index, windowDays);
    const readable = windowSum(counts.readable, index, windowDays);
    const verdict = found >= minimum;
    judged.push(days[index]);
    hasVerdict.push(verdict);
    isUnderFloor.push(verdict && readable / found < FLOOR);
    if (verdict) shares.push(readable / found);
    if (verdict) newestAgesOnVerdictDays.push(daysSinceLastArticle(counts.found, index));
  }

  // Silent stretches are the runs of days with no verdict.
  const silent = runsOfTrue(hasVerdict.map((value) => !value));
  const silentLengths = silent.map((run) => run.length);
  const longest = silent.reduce((best, run) => (run.length > best.length ? run : best), { start: 0, length: 0 });
  const verdictDays = hasVerdict.filter(Boolean).length;
  return {
    windowDays,
    minimum,
    daysJudged: judged.length,
    firstDayJudged: judged[0],
    daysWithVerdict: verdictDays,
    shareOfDaysWithVerdict: round(verdictDays / judged.length, 3),
    daysUnderFloor: isUnderFloor.filter(Boolean).length,
    shareOfVerdictDaysUnderFloor: verdictDays ? round(isUnderFloor.filter(Boolean).length / verdictDays, 3) : null,
    readableShareOnVerdictDays: { lowest: round(quantile(shares, 0), 3), median: round(quantile(shares, 0.5), 3), highest: round(quantile(shares, 1), 3) },
    newestArticleAgeOnVerdictDays: { median: quantile(newestAgesOnVerdictDays, 0.5), oldest: quantile(newestAgesOnVerdictDays, 1) },
    silentStretches: silent.length,
    silentStretchMedianDays: quantile(silentLengths, 0.5),
    silentStretchLongestDays: longest.length,
    silentStretchLongestFrom: longest.length ? judged[longest.start] : null,
    firstVerdictDay: hasVerdict.includes(true) ? judged[hasVerdict.indexOf(true)] : null,
  };
}

/**
 * The 95% Wilson interval for a share, as its lower and upper end.
 *
 * @param {number} successes
 * @param {number} total
 * @returns {{low: number, high: number}}
 */
function wilsonInterval(successes, total) {
  const z = 1.96;
  const share = successes / total;
  const centre = (share + (z * z) / (2 * total)) / (1 + (z * z) / total);
  const spread = (z * Math.sqrt((share * (1 - share)) / total + (z * z) / (4 * total * total))) / (1 + (z * z) / total);
  return { low: centre - spread, high: centre + spread };
}

/**
 * What one week of a fighter's articles looks like, over every full 7-day window.
 *
 * @param {{found: number[], readable: number[]}} counts
 * @param {string[]} days
 * @returns {object}  The spread of weekly counts, and how wide a week's readable share is.
 */
function weeklyCounts(counts, days) {
  const weeks = [];
  for (let index = WEEK_DAYS - 1; index < days.length; index += 1) {
    weeks.push({ found: windowSum(counts.found, index, WEEK_DAYS), readable: windowSum(counts.readable, index, WEEK_DAYS) });
  }
  const founds = weeks.map((week) => week.found);
  const countAtLeast = (limit) => round(founds.filter((value) => value >= limit).length / weeks.length, 3);

  // The width of the 95% interval around each week's readable share, for weeks with any articles.
  const widths = weeks.filter((week) => week.found > 0).map((week) => {
    const interval = wilsonInterval(week.readable, week.found);
    return interval.high - interval.low;
  });
  return {
    weeksCounted: weeks.length,
    articlesPerWeek: { lowest: quantile(founds, 0), tenthPercentile: quantile(founds, 0.1), median: quantile(founds, 0.5), highest: quantile(founds, 1) },
    shareOfWeeksWithNoArticle: round(founds.filter((value) => value === 0).length / weeks.length, 3),
    shareOfWeeksWithAtLeast5: countAtLeast(5),
    shareOfWeeksWithAtLeast10: countAtLeast(10),
    shareOfWeeksWithAtLeast20: countAtLeast(20),
    medianWidthOfWeeklyShareInterval: round(quantile(widths, 0.5), 3),
  };
}

/**
 * How many days it takes to gather ARTICLES_NEEDED articles, from every possible start day.
 *
 * @param {number[]} found  Articles found per day.
 * @returns {{startsThatReachIt: number, startsTried: number, medianDays: number|null, longestDays: number|null}}
 */
function daysToGather(found) {
  const needed = [];
  for (let start = 0; start < found.length; start += 1) {
    let total = 0;
    for (let index = start; index < found.length; index += 1) {
      total += found[index];
      if (total >= ARTICLES_NEEDED) {
        needed.push(index - start + 1);
        break;
      }
    }
  }
  return { startsThatReachIt: needed.length, startsTried: found.length, medianDays: quantile(needed, 0.5), longestDays: quantile(needed, 1) };
}

/**
 * The "no article found" alert: days on which the last SILENCE_ALERT_DAYS days held none.
 *
 * @param {number[]} found  Articles found per day.
 * @param {string[]} days
 * @returns {{daysWouldAlert: number, episodes: number, longestStretchWithoutAnArticleDays: number}}
 */
function silenceAlert(found, days) {
  const alerting = [];
  for (let index = SILENCE_ALERT_DAYS - 1; index < days.length; index += 1) {
    alerting.push(windowSum(found, index, SILENCE_ALERT_DAYS) === 0);
  }
  const emptyDays = runsOfTrue(found.map((value) => value === 0));
  const longest = emptyDays.reduce((best, run) => Math.max(best, run.length), 0);
  return { daysWouldAlert: alerting.filter(Boolean).length, episodes: runsOfTrue(alerting).length, longestStretchWithoutAnArticleDays: longest };
}

/**
 * Runs every replay and prints a one-line summary per fighter, window and minimum.
 */
function main() {
  const articles = JSON.parse(readFileSync(join(dataDirectory(), "articles.json"), "utf8"));
  const seenDays = articles.map((article) => article.seen_day).sort();
  const days = daysBetween(seenDays[0], seenDays.at(-1));
  const results = { recordFirstDay: days[0], recordLastDay: days.at(-1), recordDays: days.length, floor: FLOOR, fighters: {} };

  for (const fighter of FIGHTERS) {
    const counts = dailyCounts(articles, fighter, days);
    const replays = [];
    for (const windowDays of WINDOWS_DAYS) {
      for (const minimum of MINIMUMS) replays.push(replayRule(counts, days, windowDays, minimum));
    }
    const totalFound = counts.found.reduce((sum, value) => sum + value, 0);
    const totalReadable = counts.readable.reduce((sum, value) => sum + value, 0);
    results.fighters[fighter] = {
      articlesFound: totalFound,
      articlesReadable: totalReadable,
      replays,
      weekly: weeklyCounts(counts, days),
      daysToTwentyArticles: daysToGather(counts.found),
      silenceAlert: silenceAlert(counts.found, days),
    };
    for (const replay of replays) {
      console.log(fighter, `${replay.windowDays}d min ${replay.minimum}`, `verdict ${replay.daysWithVerdict}/${replay.daysJudged}`, `under floor ${replay.daysUnderFloor}`, `longest silence ${replay.silentStretchLongestDays}`);
    }
  }
  writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1) + "\n");
}

main();
