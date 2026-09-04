// The steps a bench run can exercise, one at a time. Each step is a pure
// function of an article and a context — the context carries every
// dependency (the store, the matcher, the fetcher, the rule functions), so a
// test hands in fakes and bench/run.js hands in the real modules. `needs`
// says which real resources a step touches, so the runner can refuse before
// spending anything.

import { toPipelineItem, resolveSubject } from "./items.js";

/**
 * The shared shape of a result row.
 *
 * @param {object} row       corpus row
 * @param {object} fields    got / want / ok / anything step-specific
 * @returns {object}
 */
function result(row, fields) {
  return { key: row.key, subject: row.subject, class: row.class ?? null, title: row.title.slice(0, 70), ...fields };
}

/**
 * Which bucket (docs/goals.md) the pipeline would put an article in, given
 * the matcher's verdict and the tier rule's answer. Mirrors the routing in
 * hunter.js classifyItem, without the dedup and untrusted-source gates,
 * which need an archive rather than an article:
 *
 *   wrong subject                      -> 3 (held)
 *   NEW claim of a loud type           -> 1 (a career event)
 *   NEW claim of any other real type   -> 2 (main digest)
 *   NO_CLAIM / UNSURE / ignored type   -> tier: main -> 2, tangential -> 3
 *
 * @param {object} verdict     the matcher's normalized verdict
 * @param {string} tier        digestTierFor's answer for this article
 * @param {{ loudTypes: string[], ignoredTypes: string[] }} domain
 * @returns {{ bucket: "1"|"2"|"3", outcome: string }}
 */
export function bucketFor(verdict, tier, domain) {
  if (verdict.verdict === "WRONG_SUBJECT") return { bucket: "3", outcome: "wrong_subject" };
  const type = verdict.verdict === "NEW" ? verdict.new_claim?.type : null;
  if (type && !domain.ignoredTypes.includes(type)) {
    return domain.loudTypes.includes(type)
      ? { bucket: "1", outcome: `claim:${type}` }
      : { bucket: "2", outcome: `claim:${type}` };
  }
  return tier === "tangential" ? { bucket: "3", outcome: "tangential" } : { bucket: "2", outcome: "main" };
}

/**
 * Compares a step's answer with the corpus expectation, when there is one.
 *
 * @param {string} got
 * @param {string|null|undefined} want
 * @returns {{ got: string, want: string|null, ok: boolean|null }}
 */
function scored(got, want) {
  const hasExpectation = want !== undefined && want !== null;
  return { got, want: hasExpectation ? want : null, ok: hasExpectation ? got === want : null };
}

export const STEPS = {
  tier: {
    name: "tier",
    needs: [],
    describe: "digestTierFor over the stored role — main or tangential",
    async run(row, ctx) {
      const subject = resolveSubject(ctx.subjects, row.subject);
      if (!subject) return result(row, { error: `no subject matches "${row.subject}"` });
      const role = row.production?.subject_role ?? null;
      const item = toPipelineItem(row);
      const got = ctx.digestTierFor({ title: item.title, body: row.body ?? null }, subject.matchNames, role);
      return result(row, { role, ...scored(got, row.expect?.digest_tier) });
    },
  },

  matcher: {
    name: "matcher",
    needs: ["anthropic"],
    describe: "the Haiku matcher: verdict / claim type / subject role",
    async run(row, ctx) {
      const subject = resolveSubject(ctx.subjects, row.subject);
      if (!subject) return result(row, { error: `no subject matches "${row.subject}"` });
      const item = { ...toPipelineItem(row), body: row.body ?? null };
      const candidates = ctx.candidatesFor ? await ctx.candidatesFor(subject) : [];
      const verdict = await ctx.matchItem({ subject: subject.name, item, candidates, confusables: subject.confusables ?? null });
      const got = [verdict.verdict, verdict.new_claim?.type ?? "-", verdict.subject_role ?? "-"].join("/");
      const want = row.expect
        ? [row.expect.verdict ?? "-", row.expect.claim_type ?? "-", row.expect.subject_role ?? "-"].join("/")
        : null;
      return result(row, { ...scored(got, want), verdict });
    },
  },

  bucket: {
    name: "bucket",
    needs: ["anthropic"],
    describe: "matcher + tier rule -> the goals.md bucket the article would land in",
    async run(row, ctx) {
      const subject = resolveSubject(ctx.subjects, row.subject);
      if (!subject) return result(row, { error: `no subject matches "${row.subject}"` });
      const item = { ...toPipelineItem(row), body: row.body ?? null };
      const candidates = ctx.candidatesFor ? await ctx.candidatesFor(subject) : [];
      const verdict = await ctx.matchItem({ subject: subject.name, item, candidates, confusables: subject.confusables ?? null });
      const tier = ctx.digestTierFor({ title: item.title, body: row.body ?? null }, subject.matchNames, verdict.subject_role ?? null);
      const { bucket, outcome } = bucketFor(verdict, tier, ctx.domain);
      const want = row.expect?.bucket === undefined || row.expect?.bucket === null ? null : String(row.expect.bucket);
      return result(row, { ...scored(bucket, want), outcome, role: verdict.subject_role ?? null, verdict: verdict.verdict });
    },
  },

  extract: {
    name: "extract",
    needs: ["network"],
    describe: "fetch the live article and extract its body — rung and length",
    async run(row, ctx) {
      try {
        const { body, via } = await ctx.fetchArticleBody(row.url);
        return result(row, { got: `${via}/${body ? body.length : 0}`, want: null, ok: null });
      } catch (err) {
        return result(row, { error: err.message });
      }
    },
  },

  untrusted: {
    name: "untrusted",
    needs: ["db"],
    describe: "the domain's record in the bench database and whether the rule holds it",
    async run(row, ctx) {
      const domain = ctx.domainOf(row.url);
      if (!domain) return result(row, { error: "no domain" });
      const record = await ctx.store.domainRecord(ctx.db, domain);
      const holds = ctx.isUntrustedSource(record);
      const got = `${holds ? "hold" : "pass"} (${record.wrongSubject}/${record.items} wrong-subject, ${record.bodies} bodies)`;
      return result(row, { domain, got, want: null, ok: null });
    },
  },
};

/**
 * Folds K answers for one row into one scored row. The answer is the modal
 * `got`; `agree` says how many runs gave it, so `agree / runs` is the
 * stability the corpus README asks for. Runs that errored are dropped from
 * the vote; a row whose runs all errored keeps the first error.
 *
 * @param {object[]} runs   result rows from step.run, same row K times
 * @returns {object}
 */
export function aggregateRuns(runs) {
  const answered = runs.filter((r) => !r.error);
  if (answered.length === 0) return runs[0];

  const votes = {};
  for (const r of answered) votes[r.got] = (votes[r.got] ?? 0) + 1;
  const [modal, agree] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  const winner = answered.find((r) => r.got === modal);

  return { ...winner, got: modal, ok: winner.want === null ? null : modal === winner.want, runs: runs.length, agree, votes };
}

/**
 * Per-class tallies: for every value of `by` among the scored rows, how many
 * were scored and how many were right. With `by: "want"` this is precision
 * per expected label; with `by: "class"` it is per corpus class.
 *
 * @param {object[]} rows
 * @param {string} by
 * @returns {Object<string, { scored: number, ok: number }>}
 */
function tally(rows, by) {
  const out = {};
  for (const r of rows) {
    const bucket = (out[String(r[by])] ??= { scored: 0, ok: 0 });
    bucket.scored++;
    if (r.ok) bucket.ok++;
  }
  return out;
}

/**
 * Runs one step over every row and tallies the scored ones. With
 * `repeat > 1` every row is asked that many times and scored on its modal
 * answer (aggregateRuns); `concurrency` bounds the calls in flight, since
 * the matcher is the slow, paid step. Result order follows the rows.
 *
 * @param {object} step      an entry of STEPS
 * @param {object[]} rows    corpus rows
 * @param {object} ctx
 * @param {{ repeat?: number, concurrency?: number }} options
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function runStep(step, rows, ctx, { repeat = 1, concurrency = 1 } = {}) {
  const jobs = rows.flatMap((row, index) => Array.from({ length: repeat }, (_, k) => ({ row, index, k })));
  const answers = rows.map(() => []);

  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      answers[job.index][job.k] = await step.run(job.row, ctx);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const results = answers.map((runs) => (repeat > 1 ? aggregateRuns(runs) : runs[0]));
  const scoredRows = results.filter((r) => r.ok !== null && r.ok !== undefined);
  const summary = {
    total: results.length,
    scored: scoredRows.length,
    ok: scoredRows.filter((r) => r.ok).length,
    byWant: tally(scoredRows, "want"),
  };
  if (repeat > 1) {
    summary.repeat = repeat;
    summary.stable = results.filter((r) => r.agree === r.runs).length;
  }
  return { rows: results, summary };
}
