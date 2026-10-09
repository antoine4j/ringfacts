# Operational scripts

Tools run by hand from the laptop, never by production. Each one's header says
what it does, when it was last used for real, and the exact command — all take
secrets by command substitution, e.g.
`DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL)`.

- **Audits** (read-only measurements): `audit-digest-tier.js`,
  `audit-v0-coverage.js` (does v0 hold every production article and its text),
  `audit-swallowed-confirmations.js`.
- **Backfills** (rerunnable, skip what's already done): `backfill-bodies.js`,
  `backfill-embeddings.js`.
- **Replays**: `bootstrap-claims.js` (archive → claims; dry run by default).
- **Integration checks**: `verify-digest-tier.js` (real APIs, DRY_RUN semantics).

`migrate.js` lives in the repo root, not here — it is the live schema tool
setup.sh points at, not a one-off.
