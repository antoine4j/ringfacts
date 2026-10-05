#!/usr/bin/env bash
# v0's hourly job on Cloud Run, kept apart from setup.sh so that deploying v0
# never redeploys production. Run from the repository root:
#
#   PROJECT_ID=fighter-bot-504723 bash v0/setup-v0.sh            # secret, image, job
#   PROJECT_ID=fighter-bot-504723 SCHEDULE=1 bash v0/setup-v0.sh # ... and the hourly trigger at :47
#
# Same rules as setup.sh: the region is stated on every command, every value
# reaches the job by reference to Secret Manager and none is printed, and the
# job may carry no plain environment variables. Design: section 12 of
# docs/superpowers/specs/2026-10-04-v0-design.md.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to the GCP project id}"
REGION="us-west1"
JOB="ringfacts-v0"
IMAGE="us-west1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/ringfacts-v0:latest"
ENV_FILE=".env.v0"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# One value of .env.v0, without its line ending, for --rawfile below.
value() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\n'; }

# --- v0-config: all of v0's values in one secret (D29) ------------------------
# Built once from .env.v0 without printing anything: --rawfile reads each value
# through a pipe, so none is on a command line. To change a value later (the
# chat id, once known), add a version with the whole JSON again.
if ! gcloud secrets describe v0-config --project="$PROJECT_ID" >/dev/null 2>&1; then
  jq -n -c \
    --rawfile jev <(value JEV_API_KEY) \
    --rawfile openrouter <(value OPENROUTER_API_KEY) \
    --rawfile gemini <(value GEMINI_API_KEY) \
    --rawfile token <(value TELEGRAM_BOT_TOKEN) \
    --rawfile chat <(value TELEGRAM_CHAT_ID) \
    --rawfile database <(value V0_DATABASE_URL) \
    --rawfile feed <(value V0_FEED_DATABASE_URL) \
    '{JEV_API_KEY: $jev, OPENROUTER_API_KEY: $openrouter, GEMINI_API_KEY: $gemini, TELEGRAM_BOT_TOKEN: $token,
      TELEGRAM_CHAT_ID: $chat, V0_DATABASE_URL: $database, V0_FEED_DATABASE_URL: $feed}' | tr -d '\n' | \
    gcloud secrets create v0-config --project="$PROJECT_ID" --data-file=-
fi
gcloud secrets add-iam-policy-binding v0-config --project="$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/secretmanager.secretAccessor" >/dev/null

# --- The image: built in the cloud from the repository root -------------------
gcloud builds submit --project="$PROJECT_ID" --config v0/pipeline/cloudbuild.yaml .

# --- The job: 4 minutes at most a run, so a slow hour cannot eat the free tier -
gcloud run jobs deploy "$JOB" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --clear-env-vars \
  --set-secrets=V0_CONFIG=v0-config:latest \
  --task-timeout=240 \
  --max-retries=0 \
  --cpu=1 \
  --memory=512Mi \
  --quiet

# The job must carry no plain environment variables, only the secret reference.
PLAIN=$(gcloud run jobs describe "$JOB" --project="$PROJECT_ID" --region="$REGION" --format=json \
  | jq -r '[.spec.template.spec.template.spec.containers[0].env[] | select(.valueFrom == null) | .name] | join(",")')
if [ -n "$PLAIN" ]; then
  echo "REFUSING: $JOB carries literal env vars: $PLAIN" >&2
  exit 1
fi
echo "Deployed $JOB to $REGION, all config by reference."

# --- Hourly at :47, half an hour after production's :17 (D15) ----------------
# Only with SCHEDULE=1: the job is first run by hand, and the trigger is made
# once the archive run on the laptop has finished, so the two never work the
# same readings at once.
if [ "${SCHEDULE:-}" = 1 ]; then
  gcloud run jobs add-iam-policy-binding "$JOB" --project="$PROJECT_ID" --region="$REGION" \
    --member="serviceAccount:hunter-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" --role="roles/run.invoker" >/dev/null
  gcloud scheduler jobs create http ringfacts-v0-hourly \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="47 * * * *" \
    --uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run" \
    --http-method=POST \
    --oauth-service-account-email="hunter-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" || true
fi

# Run it by hand:
# gcloud run jobs execute ringfacts-v0 --region=us-west1 --wait
# Pause it (the rollback):
# gcloud scheduler jobs pause ringfacts-v0-hourly --location=us-west1
