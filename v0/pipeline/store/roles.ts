// Creates v0's three login roles, grants v0_feed its one table in production's
// database, and writes each role's database address into the git-ignored
// .env.v0. Run once, by hand, with the owner addresses from neonctl:
//
//   V0_OWNER_URL=$(neonctl connection-string main --database-name v0 ...) \
//   PROD_OWNER_URL=$(neonctl connection-string main --database-name prod ...) \
//   node v0/pipeline/store/roles.ts
//
// A role that already has an address in .env.v0 is left alone, so running it
// again changes nothing. No password or address is ever printed.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 3, "Roles".

import pg from "pg";
import { randomBytes } from "node:crypto";
import { readEnvFile, writeEnvValue, ENV_FILE } from "./env-file.ts";

const ROLES = [
  { name: "v0_pipeline", database: "v0", envName: "V0_DATABASE_URL" },
  { name: "v0_editor", database: "v0", envName: "V0_EDITOR_DATABASE_URL" },
  { name: "v0_feed", database: "prod", envName: "V0_FEED_DATABASE_URL" },
];

/**
 * The address a role logs in with: the owner's host, this role and password, this database.
 *
 * @param ownerUrl  The owner's address for any database on the same branch.
 * @param role  The role's name.
 * @param password  The role's password.
 * @param database  The database the role connects to.
 * @returns The role's own address.
 */
export function roleUrl(ownerUrl: string, role: string, password: string, database: string): string {
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

/**
 * Creates the role, or resets its password when .env.v0 has lost it.
 *
 * @param client  Connected as the owner.
 * @param role  The role's name.
 * @param password  The new password.
 */
async function createOrResetRole(client: pg.Client, role: string, password: string): Promise<void> {
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  const verb = existing.rowCount ? "ALTER" : "CREATE";
  const statement = await client.query(`SELECT format('${verb} ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql`, [role, password]);
  await client.query(statement.rows[0].sql);
}

/**
 * Lets v0_feed read production's items table and nothing else, read-only.
 *
 * @param prodOwner  Connected to production's database as the owner.
 */
async function grantFeed(prodOwner: pg.Client): Promise<void> {
  await prodOwner.query("GRANT CONNECT ON DATABASE prod TO v0_feed");
  await prodOwner.query("GRANT USAGE ON SCHEMA public TO v0_feed");
  await prodOwner.query("GRANT SELECT ON public.items TO v0_feed");
  await prodOwner.query("ALTER ROLE v0_feed SET default_transaction_read_only = on");
}

/**
 * Makes every missing role and records its address.
 */
async function main(): Promise<void> {
  const v0OwnerUrl = process.env.V0_OWNER_URL;
  const prodOwnerUrl = process.env.PROD_OWNER_URL;
  if (!v0OwnerUrl || !prodOwnerUrl) throw new Error("set V0_OWNER_URL and PROD_OWNER_URL (from neonctl connection-string)");

  // Roles are shared by every database on the branch, so one owner connection makes them all.
  const v0Owner = new pg.Client({ connectionString: v0OwnerUrl });
  await v0Owner.connect();
  const known = readEnvFile();
  for (const role of ROLES) {
    if (known[role.envName]) {
      console.log(`${role.name}: already in ${ENV_FILE}, left alone`);
      continue;
    }
    const password = randomBytes(24).toString("base64url");
    await createOrResetRole(v0Owner, role.name, password);
    writeEnvValue(role.envName, roleUrl(v0OwnerUrl, role.name, password, role.database));
    console.log(`${role.name}: made, address written to ${ENV_FILE} as ${role.envName}`);
  }
  await v0Owner.end();

  // v0_feed's one grant lives in production's database.
  const prodOwner = new pg.Client({ connectionString: prodOwnerUrl });
  await prodOwner.connect();
  await grantFeed(prodOwner);
  await prodOwner.end();
  console.log("v0_feed: may read prod's items, read-only");
}

if (import.meta.main) await main();
