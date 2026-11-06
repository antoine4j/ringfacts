"use server";
// Anton's answers to the agents' grouping calls (lib/agent-marks.ts). An
// answer is a line appended to the local answers file, never a database row.
// Confirming a call also saves it as Anton's own mark, through the same
// actions his ✓ ✕ and "same claim as" use, so from then on it is his review.
// The call is read from the calls file here, not taken from the page, so a
// confirmation saves exactly what the agent said.

import { appendFileSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { answersPath, loadAgentMarks, readingCallKey, sameCallKey, type AgentAnswer } from "../lib/agent-marks.ts";
import type { ActionResult } from "./actions.ts";
import { markReading, markSameClaim } from "./review-actions.ts";

const ANSWERS: AgentAnswer["answer"][] = ["confirmed", "denied", "cleared"];

/**
 * Answers one agent call: confirm it (and save it as Anton's mark), deny it, or clear the answer.
 *
 * @param input  The call's key ("reading:claim:reading" or "same:claim:claim") and the answer.
 * @returns Whether it was saved, in words.
 */
export async function answerAgentCall(input: { call: string; answer: AgentAnswer["answer"] }): Promise<ActionResult> {
  try {
    if (!ANSWERS.includes(input.answer)) throw new Error("unknown answer");
    const loaded = loadAgentMarks();
    if (!loaded) throw new Error("no agent calls are loaded (AGENT_MARKS_FILE is not set)");

    // The call, from the file.
    const reading = loaded.file.readings.find((call) => readingCallKey(call.claim_id, call.reading_id) === input.call);
    const same = loaded.file.same_claims.find((call) => sameCallKey(call.claim_id, call.other_claim_id) === input.call);
    if (!reading && !same) throw new Error("there is no such agent call");

    if (input.answer === "confirmed" && reading?.verdict === "split") throw new Error("the judges split on this reading, so there is no majority call to confirm; mark it yourself");

    // Confirming saves the call as Anton's own mark first; if that fails, nothing is recorded.
    if (input.answer === "confirmed") {
      const saved = reading
        ? await markReading({ claimId: reading.claim_id, readingId: reading.reading_id, verdict: reading.verdict as Exclude<typeof reading.verdict, "split">, belongsIn: reading.belongs_in_claim_id })
        : await markSameClaim({ claimId: same!.claim_id, otherClaimId: same!.other_claim_id, verdict: "same_claim" });
      if (!saved.ok) return saved;
    }

    const line: AgentAnswer = { at: new Date().toISOString(), call: input.call, answer: input.answer };
    appendFileSync(answersPath(process.env.AGENT_MARKS_FILE!), JSON.stringify(line) + "\n");
    revalidatePath("/", "layout");
    return { ok: true, message: input.answer === "confirmed" ? "Confirmed: saved as your mark" : input.answer === "denied" ? "Denied" : "Answer cleared" };
  } catch (error) {
    return { ok: false, message: `Not saved: ${(error as Error).message}` };
  }
}

/**
 * Confirms every open call on one claim at once: each saved as Anton's mark, as if confirmed one by one.
 *
 * @param input  The claim, and the keys of the calls the page showed as open.
 * @returns How many were confirmed, in words.
 */
export async function confirmAgentCalls(input: { claimId: string; calls: string[] }): Promise<ActionResult> {
  let confirmed = 0;
  for (const call of input.calls) {
    const result = await answerAgentCall({ call, answer: "confirmed" });
    if (!result.ok) return { ok: false, message: `${confirmed} confirmed, then: ${result.message}` };
    confirmed++;
  }
  return { ok: true, message: `${confirmed} confirmed` };
}
