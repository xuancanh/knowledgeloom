# Deployment — Cloudflare + Supabase

Target architecture for the cloud offering. Every piece maps onto a seam the
codebase already has; no code changes are required to deploy this way.

```
                    ┌──────────────────────────── Cloudflare ───────────────────────────┐
  users ──────────▶ │  Pages: app SPA          Pages: landing        Pages: admin       │
                    │  (this repo /dist)       (landing repo)        (admin repo)       │
                    │        │  /api/* proxy                                            │
                    │        ▼                                                          │
                    │  Containers: API (Dockerfile, NestJS server/dist)                 │
                    │        │                    │                                     │
                    │        ▼                    ▼                                     │
                    │  R2 (notes, S3 API)   [managed Redis — Upstash TCP]               │
                    └───────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                       Supabase: Auth (JWT) + Postgres (app db + ee_* tables)
```

## Component → seam mapping

| Concern | Production choice | Existing seam (env) |
|---|---|---|
| Frontend hosting | Cloudflare Pages (3 sites: app, landing, admin) | static `dist/` builds |
| API hosting | Cloudflare Containers (or any Docker host) | `Dockerfile` |
| Auth | Supabase | `AUTH_PROVIDER=supabase` (extensions `SupabaseAuthStrategy`) |
| App + extensions database | Supabase Postgres | `DATABASE_DIALECT=postgres`, `DATABASE_URL` (migrations run at boot) |
| Note markdown storage | Cloudflare R2 | `NOTE_STORAGE=s3`, `S3_ENDPOINT=…r2.cloudflarestorage.com` |
| Job queue | Managed Redis (Upstash TCP / Railway) | `REDIS_HOST/PORT` (BullMQ needs real Redis protocol, not REST) |
| Search | in-memory to start; hosted Meilisearch later | `SEARCH_PROVIDER` |
| AI / TTS / STT / vision | any OpenAI-compatible endpoints | `AI_*`, `TTS_*`, `TRANSCRIBE_*`, `VISION_*` |
| Billing | Stripe (webhook → `/api/billing/webhook`) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

Full variable reference: `.env.production.example`.

## Why the API is a container, not a Worker

The server is a long-running NestJS process: BullMQ workers hold Redis TCP
connections, migrations run at boot, better-sqlite3 is a native module, and
import/TTS buffer real files. That rules out the Workers runtime;
[Cloudflare Containers](https://developers.cloudflare.com/containers/) (or any
Docker host — Fly.io, Railway, a VM with `docker-compose.prod.yml`) is the
right shape.

**Containers caveat:** instances sleep after inactivity (`sleepAfter`). BullMQ
retry timers and the usage-buffer flush only run while awake. Options, in
order of preference:
1. Set a long `sleepAfter` / keep one instance warm (cron-triggered Worker
   ping to `/api/status` every few minutes).
2. Accept that queued retries resume on next wake (jobs are durable in Redis).
3. If cost matters more than wake latency, host the API on Fly/Railway
   instead — everything else in this document stays the same.

## Setup, step by step

### 1. Supabase
1. Create the project; note the project URL, anon key, and JWT secret.
2. Database → Connect → copy the **session pooler** URL into `DATABASE_URL`.
   The app runs its own migrations (`0000`–`0012` + `ee_*` DDL) at boot.
3. Auth → enable the providers you want (email at minimum). The extensions frontend
   registry supplies the login UI.

### 2. Cloudflare
1. **R2**: create bucket `knowledge-loom-notes`; issue an Object Read & Write
   API token → `S3_ACCESS_KEY_ID/SECRET`.
2. **Pages** (×3): connect the GitHub repos (native GitOps — see below).
   - App: build `npm ci && npm run build`, output `dist`, env
     `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (whatever the extensions register
     module reads).
   - Add a `_redirects` file (or a Pages Function) proxying `/api/*` to the
     API origin so the SPA stays same-origin:
     `/api/* https://api.YOURDOMAIN.com/api/:splat 200`
   - Landing repo → Pages project 2; admin repo → Pages project 3.
3. **Containers**: `wrangler deploy` a Worker with a container binding on this
   repo's `Dockerfile`, secrets set via `wrangler secret put` (everything in
   `.env.production.example`). Route `api.YOURDOMAIN.com` to it.
4. **Redis**: create an Upstash Redis database (TCP endpoint) →
   `REDIS_HOST/REDIS_PORT` (+ TLS variables if you front it with a proxy).

### 3. Stripe
Point the webhook at `https://api.YOURDOMAIN.com/api/billing/webhook`, copy
the signing secret into `STRIPE_WEBHOOK_SECRET`, and set the live key. Prices
auto-provision via lookup keys on first checkout.

## GitOps — yes, and it's two layers

1. **Pages is natively GitOps.** Connecting the repos to Pages gives you:
   push to `main` → production deploy; every PR → preview URL. No workflow
   files needed for the three frontends.
2. **The API deploys from GitHub Actions.** `.github/workflows/deploy-api.yml`
   builds the Docker image and pushes it with Wrangler when `main` changes
   `server/**` or the `Dockerfile`. It is a no-op until you add the
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets, so the
   pipeline is safe to keep in the open-source tree.

State that is *not* in git (by design): secrets (GitHub environments +
`wrangler secret`), and the databases. Schema changes ARE gitops'd — the
migration runner applies committed migrations at boot, so a deploy is the
migration rollout.

## Production checklist

- [ ] `AUTH_PROVIDER=supabase` and the extensions tree present in the image build
      (`knowledge-loom-private/scripts/link-dev.sh` or a merge step in CI).
- [ ] `ADMIN_TOKEN` set (admin API returns 503 without it — safe default).
- [ ] Stripe webhook secret set; run one live-mode checkout end-to-end.
- [ ] One live-key smoke test each for AI, transcription, vision, TTS
      (all currently verified against mocks only).
- [ ] R2 bucket versioning on (notes are the product — cheap insurance).
- [ ] Supabase PITR/backup schedule confirmed.
- [ ] `/api/status` wired into uptime monitoring.
