// One-shot migration: applies schema.sql to the database in DATABASE_URL.
// Safe to re-run (every statement is IF NOT EXISTS). Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) node migrate.js

import { readFile } from "node:fs/promises";
import { openDb } from "./lib/db.js";

const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
const client = await openDb();
await client.query(sql);
await client.end();
console.log("Schema applied.");
