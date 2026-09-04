// Command-line arguments for bench/run.js, parsed without a library.

import { STEPS } from "./steps.js";

/**
 * `--step <name> [--from file.json] [--keys a1,a2] [--split tune] [--limit N]
 * [--repeat K] [--sink]`. `--repeat K` asks the step K times per item and
 * scores the modal answer; the default of 1 is a plain single pass.
 *
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ step: string, from: string, keys: string[]|null, split: string|null, limit: number|null, repeat: number, sink: boolean }}
 */
export function parseArgs(argv) {
  const out = { step: null, from: "corpus/tune.json", keys: null, split: null, limit: null, repeat: 1, sink: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--step") { out.step = value; index++; }
    else if (flag === "--from") { out.from = value; index++; }
    else if (flag === "--keys") { out.keys = value.split(",").map((k) => k.trim()).filter(Boolean); index++; }
    else if (flag === "--split") { out.split = value; index++; }
    else if (flag === "--limit") { out.limit = Number(value); index++; }
    else if (flag === "--repeat") { out.repeat = Number(value); index++; }
    else if (flag === "--sink") { out.sink = true; }
    else throw new Error(`unknown argument ${flag}`);
  }

  const choices = Object.keys(STEPS).join(" | ");
  if (!out.step) throw new Error(`--step is required: ${choices}`);
  if (!STEPS[out.step]) throw new Error(`unknown step "${out.step}": ${choices}`);
  if (!Number.isInteger(out.repeat) || out.repeat < 1) throw new Error("--repeat must be a whole number of 1 or more");
  return out;
}
