// Reads and writes values in the git-ignored .env.v0 at the repository root,
// without ever printing one.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env.v0");

/**
 * Every NAME=value line of .env.v0.
 *
 * @returns Name → value; empty when the file does not exist.
 */
export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

/**
 * Sets one value in .env.v0, replacing its line or adding one at the end.
 *
 * @param name  The variable's name.
 * @param value  Its value.
 */
export function writeEnvValue(name: string, value: string): void {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const updated = pattern.test(text) ? text.replace(pattern, () => line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  writeFileSync(ENV_FILE, updated, { mode: 0o600 });
}
