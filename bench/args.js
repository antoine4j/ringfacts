// Command-line arguments for bench/run.js, parsed without a library.

import { STEPS } from "./steps.js";

/**
 * `--step <name> [--from file.json] [--keys a1,a2] [--limit N] [--sink]`.
 *
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ step: string, from: string, keys: string[]|null, limit: number|null, sink: boolean }}
 */
export function parseArgs(argv) {
  const out = { step: null, from: "corpus/tune.json", keys: null, limit: null, sink: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--step") { out.step = value; index++; }
    else if (flag === "--from") { out.from = value; index++; }
    else if (flag === "--keys") { out.keys = value.split(",").map((k) => k.trim()).filter(Boolean); index++; }
    else if (flag === "--limit") { out.limit = Number(value); index++; }
    else if (flag === "--sink") { out.sink = true; }
    else throw new Error(`unknown argument ${flag}`);
  }

  const choices = Object.keys(STEPS).join(" | ");
  if (!out.step) throw new Error(`--step is required: ${choices}`);
  if (!STEPS[out.step]) throw new Error(`unknown step "${out.step}": ${choices}`);
  return out;
}
