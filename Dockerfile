# Knowledge Loom — all-in-one image: NestJS API + built web app.
# The server serves the SPA when /app/dist exists, so this single container is
# a complete self-hosted install (pair with redis + meilisearch via
# docker-compose.yml). See docs/tech/SELF_HOSTING.md.

# ── build stage ───────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# The extensions tree is optional: when a private repo is merged/linked into
# server/src/extensions the build includes those modules; without it this is a
# pure open-source image.
COPY . .
RUN npm run build

# Runtime deps only (better-sqlite3 and friends rebuild for this base image).
RUN npm ci --omit=dev

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r loom && useradd -r -g loom loom

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dist ./dist
COPY package.json ./
# Root package.json is ESM (vite frontend); this marks server/dist as CommonJS.
COPY server/package.json ./server/
ENV WEB_DIST=/app/dist

# Local-mode data (sqlite + markdown vault) lives here unless NOTE_STORAGE=s3
# and DATABASE_DIALECT=postgres move everything out of the container.
RUN mkdir -p /data/knowledge && chown -R loom:loom /data /app
ENV KNOWLEDGE_ROOT=/data

# The container starts as root so the entrypoint can make a freshly bind-mounted
# /data writable, then drops to the unprivileged `loom` user to run the server.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/dist/main.js"]
