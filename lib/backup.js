// Daily database backup to a GCS bucket. Neon's free tier keeps six hours of
// point-in-time restore and nothing else, so this is the only copy of the
// evidence record that outlives a mistake. Zero dependencies on purpose: the
// GCS JSON API over fetch, authenticated with the Cloud Run service account's
// token from the metadata server. Restore is scripts/restore-backup.js.
// History: docs/decisions.md#gcs-backup

import { gzipSync, gunzipSync } from "node:zlib";

const METADATA_BASE = "http://metadata.google.internal/computeMetadata/v1";
const METADATA_TOKEN_URL = `${METADATA_BASE}/instance/service-accounts/default/token`;
const METADATA_PROJECT_URL = `${METADATA_BASE}/project/project-id`;
const UPLOAD_BASE = "https://storage.googleapis.com/upload/storage/v1/b";

/**
 * Names the backup object for a moment in time: one per UTC hour, so a rerun
 * within the hour overwrites rather than duplicates.
 *
 * @param {Date} now
 * @returns {string} e.g. "backups/2026-09-04T11.json.gz"
 */
export function backupObjectName(now) {
  const hourStamp = now.toISOString().slice(0, 13);
  return `backups/${hourStamp}.json.gz`;
}

/**
 * Is this run the one that backs up today? The hunter runs hourly; exactly one
 * of those hours is the backup hour.
 *
 * @param {Date} now
 * @param {number} backupHourUtc
 * @returns {boolean}
 */
export function isBackupRun(now, backupHourUtc) {
  return now.getUTCHours() === backupHourUtc;
}

/**
 * Packs the dumped tables into gzipped JSON with the time they were taken.
 *
 * @param {Record<string, object[]>} tables  table name -> rows
 * @param {Date} takenAt
 * @returns {Buffer}
 */
export function serializeBackup(tables, takenAt) {
  const document = { taken_at: takenAt.toISOString(), tables };
  return gzipSync(Buffer.from(JSON.stringify(document), "utf8"));
}

/**
 * The inverse of serializeBackup.
 *
 * @param {Buffer} body  gzipped JSON as uploaded
 * @returns {{ taken_at: string, tables: Record<string, object[]> }}
 */
export function parseBackup(body) {
  return JSON.parse(gunzipSync(body).toString("utf8"));
}

/**
 * Fetches an access token for the job's own service account from the Cloud
 * Run metadata server.
 *
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
export async function metadataToken(fetchImpl) {
  const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`metadata server answered ${response.status}`);
  const { access_token: token } = await response.json();
  return token;
}

/**
 * Asks the metadata server which project this job runs in. The backup bucket
 * is named after it ("<project-id>-backups") so the job needs no plain env
 * var to find it — setup.sh refuses to deploy one.
 *
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>}
 */
export async function projectId(fetchImpl) {
  const response = await fetchImpl(METADATA_PROJECT_URL, { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`metadata server answered ${response.status}`);
  return (await response.text()).trim();
}

/**
 * Uploads one object to a bucket with a single media upload.
 *
 * @param {typeof fetch} fetchImpl
 * @param {{ bucket: string, name: string, body: Buffer, token: string }} upload
 * @returns {Promise<void>}
 */
export async function uploadObject(fetchImpl, { bucket, name, body, token }) {
  const url = `${UPLOAD_BASE}/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/gzip" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GCS upload answered ${response.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Dumps every table and uploads the result. Never throws: a failed backup is
 * logged and reported as null, because it must not fail the hunt that just
 * posted news.
 *
 * @param {object} run
 * @param {object} run.db          open pg client
 * @param {object} run.store       lib/db.js (or a fake) — needs dumpTables
 * @param {typeof fetch} run.fetch
 * @param {string} [run.bucket]  Explicit bucket; default "<project-id>-backups"
 * @param {Date} run.now
 * @param {{ error: Function }} [run.log]
 * @returns {Promise<string|null>} the object name written, or null on failure
 */
export async function runBackup({ db, store, fetch: fetchImpl, bucket, now, log = console }) {
  try {
    const tables = await store.dumpTables(db);
    const body = serializeBackup(tables, now);
    const name = backupObjectName(now);
    const target = bucket ?? `${await projectId(fetchImpl)}-backups`;
    const token = await metadataToken(fetchImpl);
    await uploadObject(fetchImpl, { bucket: target, name, body, token });
    return name;
  } catch (err) {
    log.error("backup failed:", err.message);
    return null;
  }
}
