# Layers per spec §16.6: Linux base + Node runtime come from the FROM line;
# deps installed at build time; app code copied on top. No secrets baked in.
FROM node:22-slim

WORKDIR /app

# Copy manifests first so the deps layer is cached unless package.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# One image, two entry points: the service runs the default CMD below,
# the hunter job overrides it with `node hunter.js`.
# Every directory the entry points import must be listed here — a missing one
# builds fine and dies at startup with ERR_MODULE_NOT_FOUND, since the local
# tree has files the image does not.
COPY server.js hunter.js ./
COPY lib ./lib
COPY domain ./domain
# Glob, not a bare filename: watchlist.js is gitignored, so a fresh clone has
# only the .example. A bare COPY would fail the build there; the glob matches
# whatever exists, and a missing real watchlist surfaces at startup with an
# actionable message instead of a Docker error.
COPY watchlist*.js ./

ENV NODE_ENV=production

# Cloud Run injects PORT; server.js reads it.
CMD ["node", "server.js"]
