// Launch bar snapshot: checks the hand-kept career events list against what v0
// did with each event, and counts the launch bar's numbers the way the scores
// page does. It runs the page's own code (v0/storyboard/lib) against the
// database, so the numbers cannot differ from the page's, then recounts the
// 👎 share by its own SQL as a cross-check. Read-only: every connection,
// including the page code's pool, is set read-only the moment it opens.
// Output holds ids, dates, outlet names and counts, never article text.
//
// Usage, from the repository root:
//   DATABASE_URL=$(grep '^V0_EDITOR_DATABASE_URL=' .env.v0 | cut -d= -f2-) \
//     node research/experiments/2026-11-18-launch-bar-snapshot/snapshot.mjs [--now 2026-11-19T05:55:00Z]

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, "../../..");
const require = createRequire(join(repositoryRoot, "v0/package.json"));
const pg = require("pg");

/** The day v0 started reading live; events before it cannot have been caught. */
const LIVE_FROM = "2026-10-05";

/** The launch bar's two windows, in days ending today (Pacific). */
const WINDOWS = { last_14_days: 14, last_28_days: 28 };

/**
 * Makes every connection this process opens refuse writes, before the first
 * query runs on it, including the pool inside the storyboard's db.ts.
 *
 * @returns Nothing; pg's Client is patched in place.
 */
function makeEveryConnectionReadOnly() {
  const originalConnect = pg.Client.prototype.connect;
  const readOnly = "SET default_transaction_read_only = on";

  /**
   * Connects as before, then sets the session read-only before anyone queries it.
   *
   * @param callback  Optional; the pool passes one.
   * @returns A promise when no callback is given.
   */
  pg.Client.prototype.connect = function connectReadOnly(callback) {
    if (typeof callback === "function") {
      originalConnect.call(this, (error) => {
        if (error) return callback(error);
        this.query(readOnly).then(() => callback(), callback);
      });
      return undefined;
    }
    return originalConnect.call(this).then(async (result) => {
      await this.query(readOnly);
      return result;
    });
  };
}

/**
 * The day a number of days before another, as calendar arithmetic.
 *
 * @param day  "YYYY-MM-DD".
 * @param days  How many days to go back.
 * @returns The earlier day.
 */
function daysBefore(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Hours between two moments, to one decimal place.
 *
 * @param earlier  A Date.
 * @param later  A Date.
 * @returns Hours, or null when either is missing.
 */
function hoursBetween(earlier, later) {
  if (!earlier || !later) return null;
  return Math.round(((later - earlier) / 3_600_000) * 10) / 10;
}

/**
 * Every reading of an event: those whose headline matches the probe inside its
 * window, and the members of the claims the list names, inside the same window.
 *
 * @param client  An open, read-only connection.
 * @param event  The event from the list.
 * @param probe  The probe: fighter, headline pattern, window.
 * @returns The readings, oldest first.
 */
async function eventReadings(client, event, probe) {
  const { rows } = await client.query(
    `SELECT rn.reading_id, rn.claim_id, rn.published_at, rn.outlet, rn.stage, rn.has_body, rn.tier, rn.cell, rn.posted_at
     FROM reading_now rn
     WHERE rn.fighter = $1 AND rn.published_at >= $2::timestamptz AND rn.published_at < $3::timestamptz
       AND (rn.headline ~* $4 OR rn.claim_id = ANY($5::bigint[]))
     ORDER BY rn.published_at, rn.reading_id`,
    [probe.fighter, probe.from, probe.to, probe.headline, event.claim_ids],
  );
  return rows;
}

/**
 * What became of one claim: its readings, best tier, tier-1 post and digests.
 *
 * @param client  An open, read-only connection.
 * @param claimId  The claim.
 * @returns The facts, with times as Dates.
 */
async function claimStory(client, claimId) {
  const members = await client.query(
    "SELECT count(*) AS readings, min(tier) AS best_tier, min(published_at) AS first_published FROM reading_now WHERE claim_id = $1",
    [claimId],
  );
  const posted = await client.query(
    "SELECT r.posted_at, r.message_id FROM claims c JOIN readings r ON r.id = c.posted_reading_id WHERE c.id = $1",
    [claimId],
  );
  const digests = await client.query(
    `SELECT d.id, d.posted_at, dc.used FROM digest_claims dc JOIN digests d ON d.id = dc.digest_id
     WHERE dc.claim_id = $1 ORDER BY d.id`,
    [claimId],
  );
  return {
    claimId: Number(claimId),
    readings: Number(members.rows[0].readings),
    bestTier: members.rows[0].best_tier,
    postedAt: posted.rows[0]?.posted_at ?? null,
    messageId: posted.rows[0]?.message_id ?? null,
    digests: digests.rows.map((row) => ({ digestId: Number(row.id), postedAt: row.posted_at, used: row.used })),
  };
}

/**
 * The claims an event's headline pattern also reached outside the claims the list names.
 *
 * @param readings  The matching readings that sit in other claims.
 * @returns One row per claim: its id, how many readings matched, and its best tier.
 */
function summariseOtherClaims(readings) {
  const byClaim = new Map();

  // Group the readings under their claims.
  for (const reading of readings) {
    const group = byClaim.get(Number(reading.claim_id)) ?? [];
    group.push(reading);
    byClaim.set(Number(reading.claim_id), group);
  }
  return [...byClaim].map(([claimId, group]) => ({ claimId, articles: group.length, bestTier: Math.min(...group.map((reading) => Number(reading.tier ?? 9))) }));
}

/**
 * The recall check for one event inside the time v0 has been live.
 *
 * @param client  An open, read-only connection.
 * @param event  The event from the list.
 * @param probe  Its probe.
 * @param status  What the page's own rule says (posted, late, missed + cause).
 * @returns One result object, ready for results.json.
 */
async function recallForEvent(client, event, probe, status) {
  const readings = await eventReadings(client, event, probe);

  // Readings in the claims the list names carry the timing; the rest are reported apart.
  const named = readings.filter((reading) => event.claim_ids.includes(Number(reading.claim_id)));
  const unclaimed = readings.filter((reading) => !reading.claim_id);
  const elsewhere = readings.filter((reading) => reading.claim_id && !event.claim_ids.includes(Number(reading.claim_id)));
  const stories = [];
  for (const claimId of event.claim_ids) stories.push(await claimStory(client, claimId));

  // The earliest article, the earliest tier-1 post and the earliest digest that used one of the claims.
  const first = named[0] ?? null;
  const postTimes = stories.map((story) => story.postedAt).filter(Boolean).sort((a, b) => a - b);
  const digestTimes = stories.flatMap((story) => story.digests.filter((digest) => digest.used && digest.postedAt).map((digest) => digest.postedAt)).sort((a, b) => a - b);
  return {
    eventId: event.id,
    pageStatus: status,
    articlesInNamedClaims: named.length,
    firstArticle: first ? { readingId: String(first.reading_id), outlet: first.outlet, publishedAt: first.published_at } : null,
    claims: stories,
    hoursToTier1Post: hoursBetween(first?.published_at, postTimes[0]),
    hoursToDigest: hoursBetween(first?.published_at, digestTimes[0]),
    matchedWithoutClaim: { articles: unclaimed.length, withoutText: unclaimed.filter((reading) => !reading.has_body).length, earliest: unclaimed[0]?.published_at ?? null },
    matchedInOtherClaims: summariseOtherClaims(elsewhere),
  };
}

/**
 * Runs the recall check over the list: every event after v0 went live.
 *
 * @param client  An open, read-only connection.
 * @param list  The parsed career-events.json.
 * @param probes  Event id → probe.
 * @param page  The storyboard's functions: claimFacts and eventStatus.
 * @returns One result per event.
 */
async function recallCheck(client, list, probes, page) {
  const live = list.events.filter((event) => event.happened >= LIVE_FROM);
  const facts = await page.claimFacts(live.flatMap((event) => event.claim_ids));
  const results = [];
  for (const event of list.events) {
    if (event.happened < LIVE_FROM) {
      results.push({ eventId: event.id, skipped: `before v0 went live on ${LIVE_FROM}` });
      continue;
    }
    results.push(await recallForEvent(client, event, probes[event.id], page.eventStatus(event, facts)));
  }
  return results;
}

/**
 * SQL for the Pacific calendar day of a timestamp column (the scores page's day).
 *
 * @param column  A fixed column name, such as "r.posted_at"; never user input.
 * @returns A SQL expression.
 */
function pacificDaySql(column) {
  return `(${column} AT TIME ZONE 'America/Los_Angeles')::date`;
}

/**
 * SQL for the newest reaction on a Telegram message, as the scores page reads it.
 *
 * @param column  A fixed column holding the message id, such as "r.message_id".
 * @returns A SQL expression giving the emoji, or null when nobody reacted.
 */
function newestReactionSql(column) {
  return `(SELECT re.emoji FROM reactions re WHERE re.message_id = ${column} ORDER BY re.update_id DESC LIMIT 1)`;
}

/**
 * Loads one file of the storyboard's lib folder, so the page's own code does the counting.
 *
 * @param file  A file name such as "scores.ts".
 * @returns The module.
 */
function importStoryboard(file) {
  return import(pathToFileURL(join(repositoryRoot, "v0/storyboard/lib", file)).href);
}

/**
 * Every tier-1 post and digest sent in a window, with its newest reaction.
 *
 * @param client  An open, read-only connection.
 * @param range  { from, to }: Pacific days, ends included.
 * @returns Rows: kind, id, telegram message id, Pacific day, newest emoji or null.
 */
async function messagesInWindow(client, range) {
  const pacificDay = pacificDaySql;
  const newest = newestReactionSql;
  const { rows } = await client.query(
    `SELECT 'post' AS kind, c.id AS id, r.message_id, ${pacificDay("r.posted_at")}::text AS day, ${newest("r.message_id")} AS newest
       FROM claims c JOIN readings r ON r.id = c.posted_reading_id
       WHERE r.posted_at IS NOT NULL AND ${pacificDay("r.posted_at")} BETWEEN $1::date AND $2::date
     UNION ALL
     SELECT 'digest', d.id, d.message_id, ${pacificDay("d.posted_at")}::text, ${newest("d.message_id")}
       FROM digests d
       WHERE d.posted_at IS NOT NULL AND NOT d.backfill AND ${pacificDay("d.posted_at")} BETWEEN $1::date AND $2::date
     ORDER BY 4, 1, 2`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ kind: row.kind, id: Number(row.id), messageId: row.message_id === null ? null : Number(row.message_id), day: row.day, newest: row.newest }));
}

/**
 * How many messages carry each newest reaction; "none" for no reaction.
 *
 * @param messages  Rows from messagesInWindow.
 * @returns Emoji (or "none") → count.
 */
function countReactions(messages) {
  const counts = {};

  // One tally per newest emoji.
  for (const message of messages) {
    const emoji = message.newest ?? "none";
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  return counts;
}

/**
 * The launch bar for one window: the page's numbers, and my own recount of the 👎 share.
 *
 * @param client  An open, read-only connection.
 * @param page  The storyboard's liveScores.
 * @param range  { from, to }.
 * @param now  The moment of the snapshot.
 * @returns The page's counts, my counts, whether they agree, and the messages with no reaction.
 */
async function launchBarForWindow(client, page, range, now) {
  const scores = await page.liveScores(range, now);
  const messages = await messagesInWindow(client, range);
  const mine = {
    sent: messages.length,
    posts: messages.filter((message) => message.kind === "post").length,
    digests: messages.filter((message) => message.kind === "digest").length,
    withReaction: messages.filter((message) => message.newest !== null).length,
    thumbsDown: messages.filter((message) => message.newest === "👎").length,
  };
  const agree = mine.sent === scores.thumbsDown.of && mine.thumbsDown === scores.thumbsDown.count && mine.sent - mine.withReaction === scores.thumbsDown.unreacted;
  return {
    range,
    page: { thumbsDown: scores.thumbsDown, repeatsInTier1: scores.repeats, careerEvents: scores.events },
    myRecount: { ...mine, agreesWithPage: agree },
    reactions: countReactions(messages),
    withReaction: messages.filter((message) => message.newest !== null).map(({ kind, id, messageId, day, newest }) => ({ kind, id, messageId, day, newest })),
    withoutReaction: messages.filter((message) => message.newest === null).map(({ kind, id, messageId, day }) => ({ kind, id, messageId, day })),
  };
}

/**
 * Reads the `--now` option, defaulting to the present moment.
 *
 * @returns A Date.
 */
function snapshotMoment() {
  const flag = process.argv.indexOf("--now");
  return flag === -1 ? new Date() : new Date(process.argv[flag + 1]);
}

/**
 * Runs the whole snapshot and writes results.json beside this file.
 *
 * @returns Nothing.
 */
async function main() {
  makeEveryConnectionReadOnly();
  const address = process.env.DATABASE_URL;
  if (!address) throw new Error("DATABASE_URL is not set; see the usage line at the top");
  const client = new pg.Client({ connectionString: address });
  await client.connect();

  // Proof of read-only, on my connection and on the storyboard's pool.
  const mineReadOnly = (await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only;
  const poolReadOnly = (await (await importStoryboard("db.ts")).query("public", "SHOW transaction_read_only"))[0].transaction_read_only;
  if (mineReadOnly !== "on" || poolReadOnly !== "on") throw new Error("a connection is not read-only; stopping");

  // The list, the probes, and the page's own functions.
  const list = JSON.parse(readFileSync(join(repositoryRoot, "v0/pipeline/measure/career-events.json"), "utf8"));
  const probes = JSON.parse(readFileSync(join(here, "probes.json"), "utf8"));
  const scoreQueries = await importStoryboard("score-queries.ts");
  const careerEvents = await importStoryboard("career-events.ts");
  const liveScores = (await importStoryboard("live-scores.ts")).liveScores;
  const now = snapshotMoment();
  const today = (await importStoryboard("dates.ts")).periodRange("today", now).to;

  // The recall check and the launch bar's windows.
  const recall = await recallCheck(client, list, probes, { claimFacts: scoreQueries.claimFacts, eventStatus: careerEvents.eventStatus });
  const windows = {};
  for (const [name, days] of Object.entries(WINDOWS)) {
    windows[name] = await launchBarForWindow(client, { liveScores }, { from: daysBefore(today, days - 1), to: today }, now);
  }
  const output = { now, today, listChecked: list.checked, readOnly: { mine: mineReadOnly, storyboardPool: poolReadOnly }, recall, windows };
  writeFileSync(join(here, "results.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  await client.end();
  process.exit(0);
}

await main();
