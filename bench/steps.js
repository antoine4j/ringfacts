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
  return { key: row.key, subject: row.subject, title: row.title.slice(0, 70), ...fields };
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
      const verdict = await ctx.matchItem({ subject, item, candidates, confusables: subject.confusables ?? null });
      const got = [verdict.verdict, verdict.new_claim?.type ?? "-", verdict.subject_role ?? "-"].join("/");
      const want = row.expect
        ? [row.expect.verdict ?? "-", row.expect.claim_type ?? "-", row.expect.subject_role ?? "-"].join("/")
        : null;
      return result(row, { ...scored(got, want), verdict });
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
 * Runs one step over every row and tallies the scored ones.
 *
 * @param {object} step      an entry of STEPS
 * @param {object[]} rows    corpus rows
 * @param {object} ctx
 * @returns {Promise<{ rows: object[], summary: { total: number, scored: number, ok: number } }>}
 */
export async function runStep(step, rows, ctx) {
  const results = [];
  for (const row of rows) {
    results.push(await step.run(row, ctx));
  }
  const scoredRows = results.filter((r) => r.ok !== null && r.ok !== undefined);
  const summary = { total: results.length, scored: scoredRows.length, ok: scoredRows.filter((r) => r.ok).length };
  return { rows: results, summary };
}
