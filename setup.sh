#!/usr/bin/env bash
# RingFacts — GCP infrastructure setup (captured from the live build, 2026-08-06).
# Rerunnable record of everything done via CLI. Spec §16.7: console once, script forever.
#
# Manual prerequisites (done in the console, not scriptable):
#   1. Google Cloud account with billing activated (card on file).
#   2. Project created (its id goes in PROJECT_ID below).
#   3. APIs can be enabled by script (below) — were enabled via console first time.
#   4. Telegram bot created via BotFather; an Anthropic API key; a Gemini key
#      from aistudio.google.com (free tier, used for embeddings). On the first
#      run the script asks for these three without echoing them and stores
#      them in ringfacts-config (values never touch this repo or shell history).
#
# Required environment:
#   PROJECT_ID        GCP project id
#   NEON_PROJECT_ID   Neon project id (neonctl projects list)
# Both are required: the :? expansions below abort rather than deploy
# something half-configured. ALERT_EMAIL is referenced too, but only by the
# commented-out monitoring command near the bottom — export it for that step.
#
# FIRST RUN ONLY, to seed the ringfacts-config secret:
#   TELEGRAM_CHAT_ID  group the hunter posts to
#   ADMIN_CHAT_ID     DM that receives failure self-reports
# Once that secret exists, NO redeploy reads them again. This is deliberate.
# Until 2026-08-10 the chat ids were passed as --set-env-vars, i.e. as literal
# text pulled from whatever shell ran the deploy. `--set-env-vars` REPLACES a
# service's entire variable list rather than merging into it, so every deploy
# had to retype every value correctly, and two did not: one wrote an empty
# string, one wrote ['-4812309756']. Both are valid strings, so nothing failed
# loudly — the hunter posted to a nonexistent chat for twenty hours while the
# archive recorded every item as delivered. The bot token, database URL and
# API keys were never damaged by any of this, because a deploy passes their
# NAME and never their value. The chat ids now get the same treatment.
#
# ALLOWED_CHAT_IDS is gone: the webhook whitelist was always these same two
# numbers in a third shape, and is now derived (lib/chat-ids.js).

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
NEON_PROJECT_ID="${NEON_PROJECT_ID:?set NEON_PROJECT_ID to your Neon project id}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"   # first run only; see header
ADMIN_CHAT_ID="${ADMIN_CHAT_ID:-}"         # first run only; see header
REGION="us-west1"
# The project was renamed FighterBot -> RingFacts on 2026-08-10, but these
# identifiers name resources already deployed and running. Changing them here
# would not rename anything on GCP — it would provision a second stack beside
# the live one. They keep the old name until a deliberate migration.
SERVICE="fighterbot"
JOB="fighterbot-hunter"

# Every `gcloud run` command below passes --region="$REGION" explicitly rather
# than leaning on the run/region config set just above. On 2026-08-10 that
# config resolved to us-central1 mid-session, and `gcloud run jobs deploy`
# does not ask whether you meant the job you already have — it silently
# CREATES a second job of the same name in the new region. Six deploys, two
# verified fixes and a chat-id repair all landed on a job the scheduler never
# calls, while the real one kept running the broken build. A job name is only
# unique within a region, so the region is part of the address.

# --- One-time local setup ---------------------------------------------------
# brew install --cask gcloud-cli
# gcloud auth login        # browser OAuth; credential stored in ~/.config/gcloud

gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

# --- Enable required APIs (idempotent) --------------------------------------
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# --- One configuration secret (docs/decisions.md#one-config-secret) ---------
# Secret Manager's free tier is six active versions. All six of production's
# values live in one secret, ringfacts-config, as one JSON object, which
# every deploy below mounts as RINGFACTS_CONFIG; lib/config.js unpacks it at
# start. Until 2026-10-05 each value had its own secret; those were destroyed
# once this one had carried production for a day.
#
# The values are supplied exactly ONCE, here, on a first run. Every deploy
# afterwards passes only the secret's NAME (--set-secrets below); Cloud Run
# fetches the value at container start, so no shell, no seeding step and no
# redeploy is needed to rotate one. Nothing is printed: the three keys are
# read without echo, and jq's --rawfile takes each value through a pipe, so
# none is on a command line either. The chat ids are validated by
# lib/chat-ids.js, which refuses one that is not a bare integer.
#
# The webhook secret is generated. NOTE the tr -d '\n': openssl appends a
# newline; storing it inside the secret causes a mismatch (Telegram gets the
# stripped value) -> every webhook 403s. Found the hard way on day one.
#
# The database address comes from neonctl. --database-name is stated rather
# than left to the branch default: the default database was renamed
# neondb -> prod once the bench got its own database beside it, and an address
# for "whatever the default is" would name a database that no longer exists.
if ! gcloud secrets describe ringfacts-config >/dev/null 2>&1; then
  : "${TELEGRAM_CHAT_ID:?first run: set TELEGRAM_CHAT_ID to seed ringfacts-config}"
  : "${ADMIN_CHAT_ID:?first run: set ADMIN_CHAT_ID to seed ringfacts-config}"
  read -rs -p "Telegram bot token: " BOT_TOKEN; echo
  read -rs -p "Anthropic API key: " ANTHROPIC_KEY; echo
  read -rs -p "Gemini API key: " GEMINI_KEY; echo
  jq -n -c \
    --rawfile token <(printf '%s' "$BOT_TOKEN") \
    --arg group "$TELEGRAM_CHAT_ID" --arg admin "$ADMIN_CHAT_ID" \
    --rawfile webhook <(openssl rand -hex 32 | tr -d '\n') \
    --rawfile database <(neonctl connection-string --project-id "$NEON_PROJECT_ID" --database-name prod | tr -d '\n') \
    --rawfile anthropic <(printf '%s' "$ANTHROPIC_KEY") \
    --rawfile gemini <(printf '%s' "$GEMINI_KEY") \
    '{TELEGRAM_BOT_TOKEN: $token, TELEGRAM_CHAT_IDS: {group: $group, admin: $admin}, TELEGRAM_WEBHOOK_SECRET: $webhook,
      DATABASE_URL: $database, ANTHROPIC_API_KEY: $anthropic, GEMINI_API_KEY: $gemini}' | tr -d '\n' | \
    gcloud secrets create ringfacts-config --data-file=-
  unset BOT_TOKEN ANTHROPIC_KEY GEMINI_KEY
fi
# To change one value later, add a version with the whole JSON — do NOT touch
# the deploy. Read one value, never printing it, with command substitution:
#   DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL)

# --- Let Cloud Run's runtime identity read the secret -----------------------
# Cloud Run runs as the project's default compute service account; the secret
# must grant that identity read access (least-privilege IAM). Outside the
# guard above, deliberately: deleting a secret deletes its IAM policy with it,
# so a secret recreated by hand exists (the guard is false) while the runtime
# can no longer read it, and the job fails at startup. add-iam-policy-binding
# is idempotent, so it costs nothing to run every time.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding ringfacts-config \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

# --- Build + deploy from source ---------------------------------------------
# Cloud Build builds the Dockerfile in the cloud, pushes to Artifact Registry,
# Cloud Run serves it. max-instances=1 is the hard cost ceiling (spec §16.4).
# No --set-env-vars at all: the whitelist now arrives inside ringfacts-config
# like every other value. That also retires the old ^:^ delimiter hack —
# ALLOWED_CHAT_IDS was itself comma-separated and comma is gcloud's list
# delimiter, so the flag needed its delimiter switched or the whitelist parsed
# as two flags and server.js booted with an empty Set, dropping every message.
gcloud run deploy "$SERVICE" \
  --region="$REGION" \
  --source . \
  --allow-unauthenticated \
  --clear-env-vars \
  --max-instances=1 \
  --memory=512Mi \
  --set-secrets=RINGFACTS_CONFIG=ringfacts-config:latest \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format="value(status.url)")
echo "Deployed: $SERVICE_URL"

# --- Neon Postgres (hunter memory; slice 2b) ---------------------------------
# Neon = serverless Postgres + pgvector, free tier, autosuspends and
# auto-resumes itself (unlike Supabase's manual unpause). Runs on AWS
# us-west-2 (Oregon) — physically next door to our GCP us-west1.
# brew install neonctl && neonctl auth   # browser OAuth, one time
# NEON_PROJECT_ID is set at the top of this script.
# neonctl projects create --name fighter-bot --region-id aws-us-west-2
# Its connection string goes into ringfacts-config on the first run (above).

# Apply the schema (idempotent; see schema.sql):
# DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL) node migrate.js
# Embed any rows recorded while the embedding key was missing/failing:
# DATABASE_URL=$(...) GEMINI_API_KEY=$(...) node scripts/backfill-embeddings.js
# Claims bootstrap (step 5): replay archive through the matcher. Dry by default:
# DATABASE_URL=$(...) GEMINI_API_KEY=$(...) ANTHROPIC_API_KEY=$(...) node scripts/bootstrap-claims.js
# COMMIT=1 ... node scripts/bootstrap-claims.js   # done 2026-08-08: 7 claims, 23 links
# Full re-bootstrap (2e): wipes claims + claim_sources (NEVER items), replays
# the archive through the body-aware matcher, re-attaches tg_message_id
# anchors by origin item. Destructive to derived state only; snapshots first.
# RESET=1 COMMIT=1 ... node scripts/bootstrap-claims.js

# --- Backup bucket (docs/decisions.md#gcs-backup) ----------------------------
# The hunter copies the three tables here once a day (lib/backup.js). The name
# is a convention the code derives from the project id — the job carries no
# plain env vars (see the assertion after the job deploy), so it cannot be
# told the name. Standard class in a US region keeps it inside the always-free
# 5 GB; the lifecycle rule rotates at 30 days and the retention policy stops
# anything, the job's own token included, from deleting a copy sooner.
BACKUP_BUCKET="gs://${PROJECT_ID}-backups"
if ! gcloud storage buckets describe "$BACKUP_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "$BACKUP_BUCKET" --location="$REGION" \
    --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention
  LIFECYCLE=$(mktemp)
  printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > "$LIFECYCLE"
  gcloud storage buckets update "$BACKUP_BUCKET" --lifecycle-file="$LIFECYCLE" --retention-period=30d
  rm -f "$LIFECYCLE"
fi
# Restore a copy (rows keep their ids; existing rows are left alone):
# gcloud storage cp "$BACKUP_BUCKET/backups/<stamp>.json.gz" /tmp/backup.json.gz
# DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL) node scripts/restore-backup.js /tmp/backup.json.gz

# --- Hunter job (spec §9 step 2) ---------------------------------------------
# Same image as the service, different entry point (--command/--args override
# the Dockerfile CMD). max-retries=0: a buggy run fails once, visibly, instead
# of retry-spamming the group.
#
# The chat ids used to sit here as --set-env-vars, on the reasoning that a chat
# id is not a secret. True, and beside the point: the risk was never disclosure,
# it was CUSTODY. A value passed by reference cannot be corrupted by the deploy
# that passes it; a value passed by text can, and was, twice.
gcloud run jobs deploy "$JOB" \
  --region="$REGION" \
  --source . \
  --command node --args hunter.js \
  --clear-env-vars \
  --set-secrets=RINGFACTS_CONFIG=ringfacts-config:latest \
  --max-retries=0 \
  --task-timeout=900 \
  --memory=512Mi \
  --quiet

# Post-deploy assertion. Cheap, and it is the check that would have caught both
# 2026-08-09 and 2026-08-10 within seconds instead of twenty hours: after this
# change the job should carry NO plain env vars at all, only secret references.
#
# --clear-env-vars above is what makes that true; this asserts it anyway,
# because the two lists are independent. Dropping --set-env-vars does NOT
# remove variables a previous deploy left behind — --set-secrets replaces only
# the secret list, and on 2026-08-10 the retired TELEGRAM_CHAT_ID sat there
# outliving the code that read it. Stale config that nothing reads is a trap
# for the next person who assumes it is live.
PLAIN=$(gcloud run jobs describe "$JOB" --region="$REGION" --format=json \
  | jq -r '[.spec.template.spec.template.spec.containers[0].env[] | select(.valueFrom == null) | .name] | join(",")')
if [ -n "$PLAIN" ]; then
  echo "REFUSING: $JOB carries literal env vars: $PLAIN" >&2
  exit 1
fi
echo "Deployed $JOB to $REGION — all config by reference."

# Run the hunter on demand:
# gcloud run jobs execute fighterbot-hunter --region=us-west1 --wait

# --- Hourly pulse: Cloud Scheduler (slice 2b) --------------------------------
# A dedicated service account whose ONLY power is executing this one job
# (least privilege), and a cron that POSTs the same Run Admin API call that
# `gcloud run jobs execute` makes.
gcloud services enable cloudscheduler.googleapis.com
gcloud iam service-accounts create hunter-scheduler \
  --display-name="Triggers fighterbot-hunter job" || true
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:hunter-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
# Minute 17, not :00 — the top of the hour is when every cron on the internet
# fires and Google is most likely to shed load (got 503s at 13:00Z once).
gcloud scheduler jobs create http fighterbot-hunter-hourly \
  --location="$REGION" \
  --schedule="17 * * * *" \
  --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/fighterbot-hunter:run" \
  --http-method=POST \
  --oauth-service-account-email="hunter-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" || true

# --- Mentions digest (docs/decisions.md#mentions-digest) ----------------------
# Same image, third entry point: `node hunter.js --mentions` sweeps the
# tangential rows the hourly runs queued and posts one message a day, grouped
# by fighter. Same secrets as the hunter, same no-plain-env-vars rule.
gcloud run jobs deploy fighterbot-mentions \
  --region="$REGION" \
  --source . \
  --command node --args hunter.js,--mentions \
  --clear-env-vars \
  --set-secrets=RINGFACTS_CONFIG=ringfacts-config:latest \
  --max-retries=0 \
  --task-timeout=300 \
  --memory=512Mi \
  --quiet

# The daily trigger. NOT created until Anton has seen the message format
# (docs/goals.md, constraints): run this line by hand once he says yes.
# 18:00 UTC = 11:00 Pacific / 21:00 Kyiv, when the day's mentions have
# accumulated and the group is awake.
# gcloud scheduler jobs create http fighterbot-mentions-daily \
#   --location="$REGION" \
#   --schedule="0 18 * * *" \
#   --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/fighterbot-mentions:run" \
#   --http-method=POST \
#   --oauth-service-account-email="hunter-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

# --- Point Telegram's webhook at the service --------------------------------
# Command substitution pulls secret values straight from Secret Manager into
# the request without echoing them. allowed_updates trims noise (no joins/edits).
curl -s "https://api.telegram.org/bot$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .TELEGRAM_BOT_TOKEN)/setWebhook" \
  -d "url=${SERVICE_URL}/webhook" \
  -d "secret_token=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .TELEGRAM_WEBHOOK_SECRET)" \
  -d 'allowed_updates=["message"]'
echo

# --- Failure alerting (Cloud Monitoring) -------------------------------------
# Email fires when a hunter execution fails. Complemented by in-code
# self-report: hunter DMs the admin on fatal errors (ADMIN_CHAT_ID above).
# Channel + policy created 2026-08-06; policy v2 2026-08-08: fires on 2+
# failed attempts within 2h (ALIGN_SUM over 7200s, threshold > 1) — single
# blips lose no news (24h fetch window) and don't deserve email. Filter:
#   metric run.googleapis.com/job/completed_task_attempt_count, result=failed,
#   resource cloud_run_job fighterbot-hunter -> notify email channel.
# gcloud beta monitoring channels create --display-name="admin email" \
#   --type=email --channel-labels=email_address="${ALERT_EMAIL}"
# gcloud alpha monitoring policies create --policy-from-file=alert-policy.json
#   (alert-policy.json was a one-off local file, not kept in the repo — recreate
#   from the filter description above if the policy ever needs rebuilding)

# --- Smoke tests ------------------------------------------------------------
curl -s "$SERVICE_URL/"                                   # expect: alive message
curl -s -o /dev/null -w "unauthed POST -> %{http_code}\n" \
  -X POST "$SERVICE_URL/webhook" -d '{}'                  # expect: 403
