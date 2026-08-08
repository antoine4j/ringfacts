#!/usr/bin/env bash
# FighterBot — GCP infrastructure setup (captured from the live build, 2026-08-06).
# Rerunnable record of everything done via CLI. Spec §16.7: console once, script forever.
#
# Manual prerequisites (done in the console, not scriptable):
#   1. Google Cloud account with billing activated (card on file).
#   2. Project created: ${PROJECT_ID}.
#   3. APIs can be enabled by script (below) — were enabled via console first time.
#   4. Secrets telegram-bot-token, anthropic-api-key and gemini-api-key created
#      with values pasted by hand in Secret Manager console (values never touch
#      this repo or shell history). Gemini key comes from aistudio.google.com
#      (free tier, used for embeddings).
#   5. Telegram bot @${BOT_USERNAME} created via BotFather (token = secret above).

set -euo pipefail

PROJECT_ID="${PROJECT_ID}"
REGION="us-west1"
SERVICE="fighterbot"

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

# --- Webhook secret (app-internal, generated, never printed) ----------------
# NOTE the tr -d '\n': openssl appends a newline; storing it inside the secret
# causes a mismatch (Telegram gets the stripped value) -> every webhook 403s.
# Found the hard way on day one.
if ! gcloud secrets describe telegram-webhook-secret >/dev/null 2>&1; then
  openssl rand -hex 32 | tr -d '\n' | \
    gcloud secrets create telegram-webhook-secret --data-file=-
fi

# --- Let Cloud Run's runtime identity read the secrets ----------------------
# Cloud Run runs as the project's default compute service account; each secret
# must individually grant that identity read access (least-privilege IAM).
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for s in telegram-bot-token anthropic-api-key telegram-webhook-secret gemini-api-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor"
done

# --- Build + deploy from source ---------------------------------------------
# Cloud Build builds the Dockerfile in the cloud, pushes to Artifact Registry,
# Cloud Run serves it. max-instances=1 is the hard cost ceiling (spec §16.4).
gcloud run deploy "$SERVICE" \
  --source . \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=512Mi \
  --set-secrets=TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,TELEGRAM_WEBHOOK_SECRET=telegram-webhook-secret:latest \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE" --format="value(status.url)")
echo "Deployed: $SERVICE_URL"

# --- Neon Postgres (hunter memory; slice 2b) ---------------------------------
# Neon = serverless Postgres + pgvector, free tier, autosuspends and
# auto-resumes itself (unlike Supabase's manual unpause). Runs on AWS
# us-west-2 (Oregon) — physically next door to our GCP us-west1.
# brew install neonctl && neonctl auth   # browser OAuth, one time
NEON_PROJECT_ID="${NEON_PROJECT_ID}"    # display name: fighter-bot
# neonctl projects create --name fighter-bot --region-id aws-us-west-2
# Connection string (contains the DB password) goes straight into Secret
# Manager via a pipe — never printed. tr -d '\n' per the day-one lesson.
if ! gcloud secrets describe neon-db-url >/dev/null 2>&1; then
  neonctl connection-string --project-id "$NEON_PROJECT_ID" | tr -d '\n' | \
    gcloud secrets create neon-db-url --data-file=-
  gcloud secrets add-iam-policy-binding neon-db-url \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/secretmanager.secretAccessor"
fi

# Apply the schema (idempotent; see schema.sql):
# DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) node migrate.js
# Embed any rows recorded while the embedding key was missing/failing:
# DATABASE_URL=$(...) GEMINI_API_KEY=$(...) node backfill-embeddings.js
# Claims bootstrap (step 5): replay archive through the matcher. Dry by default:
# DATABASE_URL=$(...) GEMINI_API_KEY=$(...) ANTHROPIC_API_KEY=$(...) node bootstrap-claims.js
# COMMIT=1 ... node bootstrap-claims.js   # done 2026-08-08: 7 claims, 23 links

# --- Hunter job (spec §9 step 2) ---------------------------------------------
# Same image as the service, different entry point (--command/--args override
# the Dockerfile CMD). Least privilege: only the bot token secret is mounted.
# Chat ID is not a secret -> plain env var. max-retries=0: a buggy run fails
# once, visibly, instead of retry-spamming the group.
gcloud run jobs deploy fighterbot-hunter \
  --source . \
  --command node --args hunter.js \
  --set-secrets=TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,DATABASE_URL=neon-db-url:latest,GEMINI_API_KEY=gemini-api-key:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --set-env-vars=TELEGRAM_CHAT_ID=-${TELEGRAM_CHAT_ID},ADMIN_CHAT_ID=${ADMIN_CHAT_ID} \
  --max-retries=0 \
  --task-timeout=300 \
  --memory=512Mi \
  --quiet

# Run the hunter on demand:
# gcloud run jobs execute fighterbot-hunter --wait

# --- Hourly pulse: Cloud Scheduler (slice 2b) --------------------------------
# A dedicated service account whose ONLY power is executing this one job
# (least privilege), and a cron that POSTs the same Run Admin API call that
# `gcloud run jobs execute` makes.
gcloud services enable cloudscheduler.googleapis.com
gcloud iam service-accounts create hunter-scheduler \
  --display-name="Triggers fighterbot-hunter job" || true
gcloud run jobs add-iam-policy-binding fighterbot-hunter \
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

# --- Point Telegram's webhook at the service --------------------------------
# Command substitution pulls secret values straight from Secret Manager into
# the request without echoing them. allowed_updates trims noise (no joins/edits).
curl -s "https://api.telegram.org/bot$(gcloud secrets versions access latest --secret=telegram-bot-token)/setWebhook" \
  -d "url=${SERVICE_URL}/webhook" \
  -d "secret_token=$(gcloud secrets versions access latest --secret=telegram-webhook-secret)" \
  -d 'allowed_updates=["message"]'
echo

# --- Failure alerting (Cloud Monitoring) -------------------------------------
# Email fires when a hunter execution fails. Complemented by in-code
# self-report: hunter DMs the admin on fatal errors (ADMIN_CHAT_ID above).
# Channel + policy created 2026-08-06; policy JSON documented the filter:
#   metric run.googleapis.com/job/completed_task_attempt_count, result=failed,
#   resource cloud_run_job fighterbot-hunter -> notify email channel.
# gcloud beta monitoring channels create --display-name="Anton email" \
#   --type=email --channel-labels=email_address=${ALERT_EMAIL}
# gcloud alpha monitoring policies create --policy-from-file=alert-policy.json

# --- Smoke tests ------------------------------------------------------------
curl -s "$SERVICE_URL/"                                   # expect: alive message
curl -s -o /dev/null -w "unauthed POST -> %{http_code}\n" \
  -X POST "$SERVICE_URL/webhook" -d '{}'                  # expect: 403
