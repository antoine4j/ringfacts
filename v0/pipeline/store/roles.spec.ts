import { test } from "node:test";
import assert from "node:assert/strict";
import { roleUrl } from "./roles.ts";

test("a role's address keeps the owner's host and names its own role, password and database", () => {
  const owner = "postgresql://neondb_owner:secret@ep-example.us-west-2.aws.neon.tech/v0?sslmode=require";
  const url = new URL(roleUrl(owner, "v0_feed", "p4ss", "prod"));
  assert.equal(url.host, "ep-example.us-west-2.aws.neon.tech");
  assert.equal(url.username, "v0_feed");
  assert.equal(url.password, "p4ss");
  assert.equal(url.pathname, "/prod");
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
});
