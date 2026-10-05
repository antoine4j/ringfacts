// The hourly run as a Mastra workflow: import production's new articles, then
// each station in order over every reading waiting at its stage, then post.
// A step never lets one reading's error escape: Mastra would fail the whole
// run and never start the readings after it (measured; spec section 5). The
// error is written onto the reading instead, and the next run tries again.

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { readProductionItems, importItems, ensureFighters } from "../store/import.ts";
import { readingsAt, recordFailure, type Reading } from "../store/readings.ts";
import { classifyReading, extractReading, groupReading, decideReading } from "./stations.ts";
import { postNewClaims } from "./post.ts";
import { digestsDue } from "./digests.ts";
import { dailyCountsDue } from "../measure/daily-counts.ts";
import { storeReactions } from "./reactions.ts";
import { count, type RunContext } from "./context.ts";

const READING = z.object({ id: z.number() }).passthrough();
const OUTCOME = z.object({ id: z.number(), outcome: z.enum(["done", "failed", "stuck", "skipped"]) });

/**
 * A step that runs one station on one reading, and never throws.
 *
 * @param context  The run.
 * @param stage  The stage the reading is at.
 * @param work  The station's work on one reading.
 * @returns The Mastra step.
 */
function stationStep(context: RunContext, stage: string, work: (reading: Reading) => Promise<void>) {
  return createStep({
    id: `${stage}-one`,
    inputSchema: READING,
    outputSchema: OUTCOME,
    execute: async ({ inputData }) => {
      const reading = inputData as unknown as Reading;

      // Past the run's deadline, the reading waits for the next run.
      if (Date.now() > context.deadline) {
        count(context, `${stage}_skipped`);
        return { id: reading.id, outcome: "skipped" as const };
      }
      try {
        await work(reading);
        count(context, `${stage}_done`);
        return { id: reading.id, outcome: "done" as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isStuck = await recordFailure(context.pool, reading.id, stage, message);
        count(context, isStuck ? `${stage}_stuck` : `${stage}_failed`);
        console.error(`reading ${reading.id} failed at ${stage}: ${message.slice(0, 200)}`);
        return { id: reading.id, outcome: isStuck ? ("stuck" as const) : ("failed" as const) };
      }
    },
  });
}

/**
 * A step that loads every reading waiting at one stage.
 *
 * @param context  The run.
 * @param stage  The stage.
 * @returns The Mastra step.
 */
function loadStep(context: RunContext, stage: string) {
  return createStep({
    id: `load-${stage}`,
    inputSchema: z.any(),
    outputSchema: z.array(READING),
    execute: async () => readingsAt(context.pool, stage),
  });
}

/**
 * The import step: production's new articles become articles and readings.
 *
 * @param context  The run.
 * @returns The Mastra step.
 */
function importStep(context: RunContext) {
  return createStep({
    id: "import",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      await ensureFighters(context.pool, context.subjects);
      if (!context.feed) return {};
      const read = await readProductionItems(context.feed, context.importDays);

      // In development, only the newest few.
      const items = context.importLimit === null ? read : read.slice(-context.importLimit);
      const counts = await importItems(context.pool, items, context.subjects, context.backfill);
      count(context, "production_items_read", items.length);
      count(context, "imported", counts.imported);
      count(context, "readings_made", counts.readings);
      count(context, "no_body", counts.noBody);
      return counts;
    },
  });
}

/**
 * The whole hourly workflow, built around one run's context.
 *
 * @param context  The run.
 * @returns The committed workflow, ready for createRun().
 */
export function buildWorkflow(context: RunContext) {
  const postStep = createStep({
    id: "post",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => postNewClaims(context),
  });
  const digestStep = createStep({
    id: "digests",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      if (!context.backfill) await digestsDue(context, new Date());
      return {};
    },
  });
  const countsStep = createStep({
    id: "daily-counts",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      if (!context.backfill) await dailyCountsDue(context, new Date());
      return {};
    },
  });
  const reactionsStep = createStep({
    id: "reactions",
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      // Only a run that may post reads reactions: it alone has the chat id.
      if (context.readsReactions) await storeReactions(context, process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
      return {};
    },
  });
  return createWorkflow({ id: "v0-hourly", inputSchema: z.any(), outputSchema: z.any() })
    .then(importStep(context))
    .then(loadStep(context, "classify"))
    .foreach(stationStep(context, "classify", (reading) => classifyReading(context, reading)), { concurrency: 5 })
    .then(loadStep(context, "extract"))
    .foreach(stationStep(context, "extract", (reading) => extractReading(context, reading)), { concurrency: 5 })
    .then(loadStep(context, "group"))
    .foreach(stationStep(context, "group", (reading) => groupReading(context, reading)), { concurrency: 1 })
    .then(loadStep(context, "decide"))
    .foreach(stationStep(context, "decide", (reading) => decideReading(context, reading)), { concurrency: 5 })
    .then(postStep)
    .then(digestStep)
    .then(countsStep)
    .then(reactionsStep)
    .commit();
}

