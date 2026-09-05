// Writes Anton's verdicts into the review sheet's last column, one line per
// id, so rulings given in chat land in the same place as ones typed into the
// file. Usage: node labels/set-anton.js '<id>|<cell>' ...
// Idempotent: a later call for the same id replaces the cell.

import { readFileSync, writeFileSync } from "node:fs";
import { parseSheetRow, formatSheetRow } from "./sheet.js";

const SHEET = "docs/grading/2026-09-05-all-articles.md";

/** Parses one "<id>|<cell>" argument. */
function parseArgument(argument) {
  const separator = argument.indexOf("|");
  return { id: Number(argument.slice(0, separator)), cell: argument.slice(separator + 1).trim() };
}

const verdicts = new Map(process.argv.slice(2).map(parseArgument).map((v) => [v.id, v.cell]));
const lines = readFileSync(SHEET, "utf8").split("\n");
let changed = 0;

// Rewrite only the rows named on the command line.
const output = lines.map((line) => {
  const row = parseSheetRow(line);
  if (!row || !verdicts.has(row.id)) return line;
  changed += 1;
  return formatSheetRow({ ...row, anton: verdicts.get(row.id) });
});
writeFileSync(SHEET, output.join("\n"));
console.error(`set ${changed} of ${verdicts.size} verdicts`);
