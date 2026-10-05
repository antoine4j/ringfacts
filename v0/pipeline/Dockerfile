# The v0 hourly job's image. Built from the repository root, because the
# pipeline reads two of production's files (watchlist.js, lib/tier.js):
#   gcloud builds submit --config v0/pipeline/cloudbuild.yaml .
# Only the pipeline's packages are installed; the storyboard (Next.js) is not.
FROM node:22-slim

WORKDIR /app

# The workspace manifests first, so the packages layer is cached until they change.
COPY v0/package.json v0/package-lock.json ./v0/
COPY v0/pipeline/package.json ./v0/pipeline/
COPY v0/storyboard/package.json ./v0/storyboard/
RUN cd v0 && npm ci --workspace pipeline --omit=dev

# Production's two files the pipeline imports, then the pipeline and its schema.
COPY watchlist.js ./
COPY lib/tier.js ./lib/
COPY v0/schema.sql v0/grants.sql ./v0/
COPY v0/pipeline ./v0/pipeline

ENV NODE_ENV=production
WORKDIR /app/v0/pipeline
CMD ["node", "run.ts", "--kind", "hourly"]
