# Knowledge Loom API server — production image.
# The SPA is deployed separately (Cloudflare Pages); this container is the
# NestJS API only. See docs/DEPLOYMENT.md.

# ── build stage ───────────────────────────────────────────────────────────────
FROM node:26-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY server ./server
# EE tree is optional: when the private repo is merged/linked into server/src/ee
# the build includes enterprise modules; without it this is a pure OSS image.
RUN npm run server:build

# Runtime deps only (better-sqlite3 and friends rebuild for this base image).
RUN npm ci --omit=dev

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r loom && useradd -r -g loom loom

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY package.json ./
# Root package.json is ESM (vite frontend); this marks server/dist as CommonJS.
COPY server/package.json ./server/

# Local-mode data (sqlite + markdown vault) lives here unless NOTE_STORAGE=s3
# and DATABASE_DIALECT=postgres move everything out of the container.
RUN mkdir -p /data/knowledge && chown -R loom:loom /data /app
ENV KNOWLEDGE_ROOT=/data

USER loom
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/main.js"]
