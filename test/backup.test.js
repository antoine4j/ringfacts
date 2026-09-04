// The daily database backup (lib/backup.js). Everything here runs against
// fakes: a recorded fetch stands in for the GCS JSON API and the metadata
// server, and a fake store hands back canned tables. The real SQL half —
// dumpTables and restoreTables against Postgres — is tier 3 (test/sql.test.js).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import {
  backupObjectName, isBackupRun, serializeBackup, parseBackup,
  metadataToken, uploadObject, runBackup, projectId,
} from "../lib/backup.js";

const TABLES = {
  items: [{ id: "1", url: "https://example.test/a", subject: "Testov Example" }],
  claims: [{ id: "1", subject: "Testov Example", status: "rumor" }],
  claim_sources: [{ item_id: "1", claim_id: "1", role: "origin" }],
};

// A fetch that records every call and answers from a queue of responses.
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    return {
      ok: next.status < 300,
      status: next.status,
      text: async () => next.text ?? "",
      json: async () => JSON.parse(next.text),
    };
  };
  return { fetch, calls };
}

describe("naming and scheduling", () => {
  test("the object name is the UTC date and hour, under backups/", () => {
    const name = backupObjectName(new Date("2026-09-04T11:17:42Z"));
    assert.equal(name, "backups/2026-09-04T11.json.gz");
  });

  test("a run backs up only during the configured UTC hour", () => {
    assert.equal(isBackupRun(new Date("2026-09-04T11:17:00Z"), 11), true);
    assert.equal(isBackupRun(new Date("2026-09-04T12:17:00Z"), 11), false);
  });
});

describe("serialization", () => {
  test("a backup round-trips through gzip with its tables and timestamp", () => {
    const takenAt = new Date("2026-09-04T11:17:00Z");
    const body = serializeBackup(TABLES, takenAt);
    assert.ok(Buffer.isBuffer(body));

    const parsed = parseBackup(body);
    assert.equal(parsed.taken_at, "2026-09-04T11:17:00.000Z");
    assert.deepEqual(parsed.tables, TABLES);
  });

  test("parseBackup accepts the raw gzip bytes GCS hands back", () => {
    const body = serializeBackup(TABLES, new Date());
    const asJson = JSON.parse(gunzipSync(body).toString("utf8"));
    assert.deepEqual(parseBackup(body).tables, asJson.tables);
  });
});

describe("talking to Google", () => {
  test("metadataToken asks the metadata server with the required header", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, text: '{"access_token":"tok-1"}' }]);
    const token = await metadataToken(fetch);
    assert.equal(token, "tok-1");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^http:\/\/metadata\.google\.internal\/computeMetadata\/v1\/instance\/service-accounts\/default\/token$/);
    assert.equal(calls[0].init.headers["Metadata-Flavor"], "Google");
  });

  test("uploadObject does a media upload with the bearer token and gzip type", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, text: "{}" }]);
    const body = Buffer.from("payload");
    await uploadObject(fetch, { bucket: "my-bucket", name: "backups/x.json.gz", body, token: "tok-1" });

    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, "https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o?uploadType=media&name=backups%2Fx.json.gz");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer tok-1");
    assert.equal(init.headers["Content-Type"], "application/gzip");
    assert.equal(init.body, body);
  });

  test("uploadObject throws on a non-OK response, naming the status", async () => {
    const { fetch } = fakeFetch([{ status: 403, text: "forbidden" }]);
    await assert.rejects(
      () => uploadObject(fetch, { bucket: "b", name: "n", body: Buffer.alloc(0), token: "t" }),
      /403/
    );
  });
});

describe("runBackup", () => {
  // The happy path: token, then upload, and the upload carries the dump.
  test("dumps the tables and uploads them under the dated name", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, text: '{"access_token":"tok-1"}' },
      { status: 200, text: "{}" },
    ]);
    const store = { dumpTables: async () => TABLES };
    const now = new Date("2026-09-04T11:17:00Z");

    const result = await runBackup({ db: {}, store, fetch, bucket: "my-bucket", now });

    assert.equal(result, "backups/2026-09-04T11.json.gz");
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /name=backups%2F2026-09-04T11\.json\.gz$/);
    assert.deepEqual(parseBackup(calls[1].init.body).tables, TABLES);
  });

  // A backup failure must never fail the hunt that just posted news.
  test("reports a failure instead of throwing", async () => {
    const { fetch } = fakeFetch([{ status: 500, text: "boom" }]);
    const store = { dumpTables: async () => TABLES };
    const errors = [];

    const result = await runBackup({
      db: {}, store, fetch, bucket: "my-bucket", now: new Date(),
      log: { error: (...args) => errors.push(args.join(" ")) },
    });

    assert.equal(result, null);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /backup failed/);
  });
});

describe("the bucket by convention", () => {
  // Cloud Run jobs carry no plain env vars here (setup.sh refuses to deploy
  // one), so the bucket name is derived from the project id instead:
  // "<project-id>-backups". Only a local override names it explicitly.
  test("projectId asks the metadata server for the project", async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, text: "fighter-bot-504723" }]);
    const id = await projectId(fetch);
    assert.equal(id, "fighter-bot-504723");
    assert.match(calls[0].url, /computeMetadata\/v1\/project\/project-id$/);
    assert.equal(calls[0].init.headers["Metadata-Flavor"], "Google");
  });

  test("runBackup without a bucket uploads to <project-id>-backups", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, text: "fighter-bot-504723" },
      { status: 200, text: '{"access_token":"tok-1"}' },
      { status: 200, text: "{}" },
    ]);
    const store = { dumpTables: async () => TABLES };
    await runBackup({ db: {}, store, fetch, now: new Date("2026-09-04T11:17:00Z") });
    assert.match(calls[2].url, /\/b\/fighter-bot-504723-backups\/o\?/);
  });
});
