// The counting used by every score here: a share with its 95% range, the
// majority of several answers, how many agreed, and Fleiss' kappa (agreement
// between several raters beyond what chance would give).

/**
 * A share with its Wilson 95% range.
 *
 * @param count  How many.
 * @param of  Out of.
 * @returns The share and its range, in percent, plus a printable form.
 */
export function share(count, of) {
  if (of === 0) return { count, of, pct: null, low: null, high: null, text: "–" };
  const z = 1.96;
  const p = count / of;
  const centre = (p + (z * z) / (2 * of)) / (1 + (z * z) / of);
  const half = (z * Math.sqrt((p * (1 - p)) / of + (z * z) / (4 * of * of))) / (1 + (z * z) / of);
  const pct = (value) => Math.round(1000 * value) / 10;
  return { count, of, pct: pct(p), low: pct(centre - half), high: pct(centre + half), text: `${count} of ${of} = ${pct(p)}% (${pct(centre - half)}–${pct(centre + half)})` };
}

/**
 * The answer most raters gave, and how many gave it.
 *
 * @param answers  One answer per rater; a missing one is skipped.
 * @returns The majority answer (the first on a tie) and its count; null when no answers.
 */
export function majority(answers) {
  const counts = new Map();
  for (const answer of answers) if (answer !== undefined && answer !== null) counts.set(answer, (counts.get(answer) ?? 0) + 1);
  if (!counts.size) return null;
  let best = null;
  for (const [answer, count] of counts) if (!best || count > best.count) best = { answer, count };
  return { ...best, raters: [...counts.values()].reduce((sum, count) => sum + count, 0), unanimous: best.count === [...counts.values()].reduce((sum, count) => sum + count, 0) };
}

/**
 * Fleiss' kappa: how far several raters agree beyond chance, on items each rated by the same number of raters.
 *
 * @param items  One array of answers per item (equal length each).
 * @returns Kappa, or null when it cannot be computed.
 */
export function fleissKappa(items) {
  const rated = items.filter((answers) => answers.length > 1 && answers.every((answer) => answer !== undefined && answer !== null));
  if (!rated.length) return null;
  const n = rated[0].length;
  if (rated.some((answers) => answers.length !== n)) throw new Error("every item needs the same number of raters");
  const categories = new Map();
  for (const answers of rated) for (const answer of answers) categories.set(answer, (categories.get(answer) ?? 0) + 1);
  const total = rated.length * n;
  let pe = 0;
  for (const count of categories.values()) pe += (count / total) ** 2;
  let pBar = 0;
  for (const answers of rated) {
    const counts = new Map();
    for (const answer of answers) counts.set(answer, (counts.get(answer) ?? 0) + 1);
    let agree = 0;
    for (const count of counts.values()) agree += count * (count - 1);
    pBar += agree / (n * (n - 1));
  }
  pBar /= rated.length;
  if (pe === 1) return 1;
  return Math.round(1000 * ((pBar - pe) / (1 - pe))) / 1000;
}

/**
 * Splits items by how many raters agreed: all, a majority, or none.
 *
 * @param items  One array of answers per item.
 * @returns Counts of unanimous, majority-only and split items.
 */
export function agreementCounts(items) {
  const counts = { unanimous: 0, majority: 0, split: 0, items: items.length };
  for (const answers of items) {
    const best = majority(answers);
    if (!best) continue;
    if (best.unanimous) counts.unanimous++;
    else if (best.count > best.raters / 2) counts.majority++;
    else counts.split++;
  }
  return counts;
}
