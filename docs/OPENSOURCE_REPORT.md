# Open Source Strategy Report — Knowledge Loom

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Audit](#2-current-architecture-audit)
3. [Industry Research](#3-industry-research)
4. [Structural Options for Closed-Source EE](#4-structural-options-for-closed-source-ee)
5. [Recommended Architecture: Separate Private Repo](#5-recommended-architecture-separate-private-repo)
6. [Feature Classification](#6-feature-classification)
7. [Implementation Details](#7-implementation-details)
8. [Licensing](#8-licensing)
9. [Engineering Roadmap](#9-engineering-roadmap)
10. [Risks and Mitigations](#10-risks-and-mitigations)

---

## 1. Executive Summary

Knowledge Loom is ready to open source today. The core PKM engine — notes, flashcards, quiz, spaced repetition, RAG chat, reminders, knowledge graph, i18n — requires **no architectural changes** to ship as OSS. The only hard coupling to enterprise infrastructure is the Supabase authentication layer, concentrated in two files on each side (frontend and backend).

**Recommended strategy**: Open-source the core under **AGPLv3**. Keep authentication, billing, multi-tenancy, admin, and usage tracking in a **separate private repository** that is merged at build time to produce the enterprise Docker image. The OSS public repo never contains an `ee/` directory. Enterprise customers receive a pre-built container image; they never touch EE source.

**Minimum viable change to publish the OSS repo**: extract `SupabaseAuthGuard` into the private EE repo, write a `LocalAuthGuard` replacement, remove `@supabase/supabase-js` from the frontend, write a Docker Compose self-hosting guide.

---

## 2. Current Architecture Audit

### 2.1 What exists today

| Layer | Component | Enterprise-relevant? | Notes |
|-------|-----------|---------------------|-------|
| Auth (backend) | `SupabaseAuthGuard` — verifies Supabase JWT; falls back to `userId='local'` when secret unset | **Yes** | Only hard coupling |
| Auth (frontend) | `useAuth.ts`, `LoginPage.tsx`, `supabase.ts` — Supabase JS SDK | **Yes** | Must move to EE |
| Marketing | `LandingPage.tsx` — SaaS landing page | **Yes** | Move to EE |
| Storage | `LocalNoteStorage` (filesystem under `knowledge/users/{userId}/notes/`) | No | Ship OSS |
| Storage | `S3NoteStorage` (S3-compatible: R2, AWS, MinIO) | No | Ship OSS |
| Database | SQLite (`better-sqlite3`) + PostgreSQL (`pg` + Drizzle ORM) | No | Ship OSS |
| AI providers | `CodexAiProvider` (Codex CLI), `OpenRouterAiProvider` (any OpenAI-compatible API) | No | Ship OSS |
| Search | `InMemorySearchProvider`, `MeilisearchProvider` | No | Ship OSS |
| Features | Notes, flashcards, quiz, reminders, RAG chat, knowledge graph, i18n (9 locales) | No | Ship OSS |
| Job queue | BullMQ + Redis | No | Ship OSS |
| Multi-tenancy | All DB tables namespaced by `userId`; file paths as `users/{userId}/notes/` | Architecture ready | Data model is already multi-tenant |
| Billing | Nothing | **Missing — EE only** | Build in private repo |
| Org/teams | Nothing | **Missing — EE only** | Build in private repo |
| Admin panel | Nothing | **Missing — EE only** | Build in private repo |
| Usage tracking | Nothing | **Missing — EE only** | Build in private repo |

### 2.2 Key observations

**Auth is the only hard coupling.** Every other infrastructure concern (AI, storage, search, database) is already behind a pluggable interface (`AiProvider`, `NoteStorageProvider`, `SearchProvider`). Auth is wired directly — backend JWT guard uses Supabase-specific verification, frontend uses the Supabase JS SDK.

**Local mode is a complete, working OSS story already.** When `SUPABASE_JWT_SECRET` is unset, the backend accepts all requests as `userId='local'` and the frontend bypasses the login flow entirely. This is used for development today. Packaging it properly makes it a first-class self-hosting experience.

**Multi-tenancy is implemented but gated behind auth.** Every database table has a `userId` column. File paths are `users/{userId}/notes/`. The data model is production-ready for multi-user; only the authentication layer that enforces isolation sits in the enterprise tier.

**Nothing to surgically remove.** There is no billing, SSO, admin panel, or org management to extract — they don't exist yet. The split is about building new enterprise features in the right place from the start, not about disentangling existing code.

### 2.3 Existing pluggable interfaces (OSS extensibility)

```
AiProvider          → CodexAiProvider | OpenRouterAiProvider
NoteStorageProvider → LocalNoteStorage | S3NoteStorage
SearchProvider      → InMemorySearchProvider | MeilisearchProvider
DatabaseModule      → SQLite (default) | PostgreSQL (via DATABASE_URL)
AuthGuard           → LocalAuthGuard (OSS) | SupabaseAuthGuard (EE, to be extracted)
```

The pattern exists. Auth needs to follow it.

---

## 3. Industry Research

Eight comparable open-source projects were studied in depth. The findings are summarised here.

### 3.1 Project matrix

| Project | License (Core) | EE Structure | EE Enforcement | OSS Feature Parity |
|---------|---------------|--------------|----------------|-------------------|
| **Cal.com** | AGPLv3 | `packages/features/ee/` in same repo | Runtime license key (env var) | No — EE features locked |
| **Outline** | BSL 1.1 | None (single codebase) | Legal prohibition on commercial hosting | Yes — all features available |
| **Plane** | AGPLv3 | Separate private `plane-ee` repo | OpenFeature flags + periodic license check | Partial — CE = Cloud Free only |
| **Documenso** | AGPLv3 | `packages/ee/` in same repo (build-coupled) | License key | Mostly yes — generous OSS tier |
| **Mattermost** | MIT + AGPL | Compiled binary; source in `server/enterprise/` | License key activates EE binary | Capped free tier without key |
| **GitLab** | MIT (CE) | `ee/` top-level directory in same repo | Runtime tier check | Yes — EE binary runs Free tier |
| **Supabase** | Apache 2.0 | None — no EE directory | Platform-only capabilities (PITR, branching) | Partial — managed ops only |
| **Huly** | EPL-2.0 | None — no enterprise tier | N/A | Yes — full parity |

### 3.2 Four structural patterns

**Pattern A — Monorepo + `ee/` folder** (Cal.com, Documenso, GitLab)

Single repo. `ee/` directory is under a separate commercial license. Everything outside `ee/` is OSI-approved. A runtime license-key check controls access. The one invariant that makes this work: OSS code never imports `ee/`; EE code freely imports OSS. Enforced by ESLint.

*Cal.com cautionary tale*: Cal.com went MIT → AGPL+EE → production codebase diverged from public repo → Cal.diy stripped-down fork. Community trust eroded badly when the divergence was discovered. The fix is keeping the OSS repo as the true source of production code, with EE features added on top rather than replacing core functionality.

*Documenso anti-pattern*: Their `packages/ee/` is imported in the AGPL build system — the project cannot compile without it. This is legally ambiguous and community-hostile. Never do this.

*GitLab gold standard*: `prepend_mod` (Ruby) and `ee_else_ce` (JS) let EE modules extend CE classes without CE files directly referencing EE code. Deleting `ee/` produces a fully functional CE build.

**Pattern B — Separate repos** (Plane)

Public AGPLv3 community repo + private enterprise repo. EE code builds on top of CE via feature flags (Plane uses OpenFeature + "Disco" system tied to Stripe). Complete legal and technical separation. Dual maintenance burden; bug fixes may need PRs in both repos.

**Pattern C — BSL / source-available** (Outline)

Single codebase, BSL 1.1. No feature gating — the license blocks commercial hosting. Not recommended: BSL is not OSI-approved, creates procurement friction in regulated industries, and is widely perceived as "not real open source."

**Pattern D — Apache 2.0, no EE layer** (Supabase, Huly)

All code permissively licensed. Enterprise value lives in managed infrastructure capabilities that are operationally complex to self-replicate. Only viable if your enterprise moat is operational complexity, not features — does not apply to a PKM application.

### 3.3 Features that are universally enterprise-gated

Across all eight projects, these categories are gated in the commercial tier without exception:

1. SSO / SAML 2.0 / OIDC / SCIM provisioning
2. Audit logs and compliance export (eDiscovery)
3. High availability and horizontal scaling
4. Compliance certifications (SOC 2, HIPAA, ISO 27001)
5. Advanced analytics and reporting dashboards
6. Air-gapped / offline deployment
7. Multi-tenancy and org/team governance
8. AI-powered features (in newer projects — Mattermost, GitLab Duo)

Features that **always remain free** across every project studied: core CRUD, REST API, webhooks, basic email/OAuth auth, self-hosting support. Gating any of these kills community adoption.

### 3.4 Synthesis

For a small team launching an open-core PKM product, **Pattern B (separate repos)** with a pre-built Docker image for enterprise delivery is the cleanest choice. It keeps EE source fully private (not even source-available), avoids `ee/` import discipline problems, and is exactly what Plane does. The public repo is a genuine, complete product — not a demo tier.

---

## 4. Structural Options for Closed-Source EE

Four options for keeping EE code truly closed (not visible in the public repo):

### Option 1: Separate private repo + CI build merge (recommended)

```
github.com/you/knowledge-loom       ← public, AGPLv3
github.com/you/knowledge-loom-ee    ← private, proprietary
```

Enterprise CI checks out both repos, copies EE source into the OSS tree, then builds a single Docker image. The OSS repo has no `ee/` directory at all — not even stubs.

```bash
# Enterprise CI build
git clone git@github.com:you/knowledge-loom        oss/
git clone git@github.com:you/knowledge-loom-ee      ee/

cp -r ee/server/src/ee   oss/server/src/ee
cp -r ee/src/ee          oss/src/ee

cd oss && docker build -t ghcr.io/you/knowledge-loom-enterprise:latest .
docker push ghcr.io/you/knowledge-loom-enterprise:latest
```

After the copy, TypeScript and Vite compile one codebase — the compiler sees `ee/` as if it always existed. Self-hosted enterprise customers `docker pull` and run; they never touch source.

**Best fit**: most use cases.

### Option 2: Private npm package

EE code compiled and published to a private registry (`npm.pkg.github.com` or a self-hosted Verdaccio):

```
@knowledgeloom/ee → private npm registry
```

OSS `package.json` doesn't include it. Enterprise `package.json` adds it as a dependency. Customers receive an npm token alongside their license. The published package is compiled/minified, making reverse-engineering harder than raw source.

```typescript
// server/src/main.ts
try {
  const { EeModule } = require('@knowledgeloom/ee/server');
  // register EeModule
} catch { /* OSS build */ }
```

**Best fit**: when EE has its own release cadence independent of the OSS core.

### Option 3: Git submodule

`server/src/ee/` is a git submodule pointing to the private repo. OSS users get an empty directory; enterprise customers initialize the submodule with their SSH credentials.

Not recommended: submodule SHA is visible in public commit history; `git pull` doesn't update submodules automatically; overall developer experience is painful.

### Option 4: Separate microservice

EE features run as a standalone HTTP service. The OSS app calls it over the network. Complete source isolation — OSS app only knows an HTTP endpoint, not the EE implementation.

```typescript
// OSS: fire-and-forget usage event
await fetch(`${process.env.EE_SERVICE_URL}/api/usage/track`, {
  method: 'POST',
  body: JSON.stringify({ userId, event, meta }),
}).catch(() => {});
```

**Best fit**: features that are naturally service-like — billing (Stripe webhooks), SSO (auth proxy), admin dashboard. Poor fit for tight integrations like per-request quota enforcement.

### Option 5: Compiled binary (WASM / native Node module)

EE code compiled to `.wasm` or a `.node` N-API module. Extremely hard to reverse-engineer. Used by JetBrains, some Mattermost plugins.

**Best fit**: maximum IP protection where build/maintenance complexity is acceptable. Overkill for a PKM product.

### Comparison

| | Sep. repo + CI merge | Private npm | Git submodule | Microservice | Binary |
|---|---|---|---|---|---|
| EE source visible | Never | No (compiled) | Never | Never | Never |
| Setup complexity | Low | Low–Medium | Low (painful later) | Medium | High |
| Tight integration | Easy | Easy | Easy | Hard (HTTP latency) | Medium |
| Independent versioning | Manual | Native | Manual | Native | Native |
| Self-hosted enterprise | Yes | Yes | Yes | Yes (2 containers) | Yes |
| Recommended | **Yes** | Yes (later) | Avoid | For service-like features | Overkill |

---

## 5. Recommended Architecture: Separate Private Repo

### 5.1 Directory layout after CI merge

```
knowledge-loom/               ← public repo (AGPLv3)
├── server/src/
│   ├── auth/
│   │   ├── auth.guard.interface.ts   ← NEW: IAuthGuard interface + AUTH_GUARD token
│   │   ├── local-auth.guard.ts       ← NEW: local mode + optional AUTH_SECRET bearer
│   │   └── auth.module.ts            ← updated: provides LocalAuthGuard by default
│   ├── usage/
│   │   ├── usage.service.ts          ← NEW: IUsageService interface + no-op default
│   │   └── usage.module.ts           ← NEW: provides NoopUsageService by default
│   └── ... (all current modules unchanged)
├── src/
│   ├── lib/
│   │   └── ee-registry.ts            ← NEW: empty component slot registry
│   ├── main.tsx                      ← updated: tries import('./ee/register') on boot
│   └── ... (all current components unchanged)
└── LICENSE                           ← AGPLv3

knowledge-loom-ee/            ← private repo (proprietary)
├── server/src/ee/
│   ├── ee.module.ts                  ← EE root module, loaded by AppModule
│   ├── auth/
│   │   ├── supabase.guard.ts         ← moved from OSS auth/
│   │   └── ee-auth.module.ts         ← overrides AUTH_GUARD token
│   ├── usage/
│   │   ├── ee-usage.service.ts       ← writes to usage_events table
│   │   └── ee-usage.module.ts        ← overrides USAGE_SERVICE token
│   ├── admin/
│   │   ├── admin.controller.ts       ← GET /api/admin/users, /api/admin/usage
│   │   └── admin.module.ts
│   ├── billing/
│   │   ├── billing.controller.ts     ← POST /api/billing/webhook (Stripe)
│   │   └── billing.module.ts
│   └── orgs/
│       ├── orgs.controller.ts        ← org/team management API
│       └── orgs.module.ts
└── src/ee/
    ├── register.ts                   ← populates eeRegistry on boot
    ├── auth/
    │   └── LoginPage.tsx             ← moved from OSS components/auth/
    ├── landing/
    │   └── LandingPage.tsx           ← moved from OSS components/landing/
    └── admin/
        └── UsageDashboard.tsx        ← new: admin analytics UI
```

### 5.2 The one rule that makes it work

> **OSS code never imports from `ee/`. EE code may freely import from OSS.**

The OSS `app.module.ts` loads EE via a dynamic import that catches `MODULE_NOT_FOUND`. No static import of EE code ever appears in the public repo.

---

## 6. Feature Classification

### Always OSS (AGPLv3)

| Feature | Rationale |
|---------|-----------|
| Note CRUD, categories, tags, knowledge graph | Core PKM, drives adoption |
| AI research / link capture (Codex, OpenRouter, Ollama) | Community value |
| Flashcards + spaced repetition (SM-2 algorithm) | Differentiator, keep open |
| Quiz (fill-blank, multiple choice, short answer) | Same |
| RAG chat over notes | Same |
| Reminders | Core utility |
| Full-text search (Meilisearch + in-memory fallback) | Infrastructure |
| Local filesystem + S3 note storage | Self-hosting story |
| SQLite + PostgreSQL database | Self-hosting story |
| Redis / BullMQ job queue | Infrastructure |
| i18n (9 locales) | Community |
| Single-user local mode (no auth required) | Primary OSS deployment |
| Simple bearer-token auth (`AUTH_SECRET` env var) | Internet-exposed self-hosters |
| Docker Compose self-hosting | Community |

### Enterprise only (proprietary, private repo)

| Feature | Rationale |
|---------|-----------|
| Supabase JWT authentication | Vendor-specific, cloud-oriented |
| SSO / SAML 2.0 / OIDC | Classic enterprise gate |
| Social OAuth (Google, GitHub, Microsoft) | Managed service convenience |
| SCIM user provisioning | Enterprise IT requirement |
| Multi-user / organization / workspace model | Team use cases |
| Note sharing within an org | Requires org model |
| Role-based access control (RBAC) | Requires org model |
| Admin panel (user management, quota, audit) | Ops tooling |
| Billing / Stripe integration | Revenue |
| Per-user AI usage tracking and quotas | Cost control |
| Usage analytics dashboard | Enterprise ops |
| Audit logs | Compliance |
| Email notifications (reminders via email) | Cloud service |
| SaaS landing page | Marketing |
| Managed cloud service | Cloud product |

### Ship OSS, monetize at the cloud layer

| Feature | Notes |
|---------|-------|
| S3 storage backend | Already in OSS; cloud pre-configures it |
| PostgreSQL backend | Same pattern |
| Meilisearch | Same |

These are infrastructure choices. Giving them away builds self-hosting trust. The cloud product's value is managed operations, not locked-in features.

---

## 7. Implementation Details

### 7.1 Backend: NestJS provider override pattern

The OSS codebase defines interfaces and no-op defaults. EE overrides the same NestJS injection tokens. The rest of the application is unaware of which implementation it received.

**Step 1 — Auth interface (OSS, public repo)**

```typescript
// server/src/auth/auth.guard.interface.ts
export const AUTH_GUARD = 'AUTH_GUARD';
```

```typescript
// server/src/auth/local-auth.guard.ts
@Injectable()
export class LocalAuthGuard implements CanActivate {
  private readonly secret = process.env.AUTH_SECRET;

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!this.secret) {
      req.userId = 'local'; // no-auth local mode
      return true;
    }
    const token = req.headers['authorization']?.split(' ')[1];
    if (token !== this.secret) throw new UnauthorizedException();
    req.userId = 'local';
    return true;
  }
}
```

```typescript
// server/src/auth/auth.module.ts
@Global()
@Module({
  providers: [
    LocalAuthGuard,
    { provide: AUTH_GUARD, useExisting: LocalAuthGuard },
  ],
  exports: [AUTH_GUARD],
})
export class AuthModule {}
```

All controllers use `@UseGuards(AUTH_GUARD)` — same token, different implementation per build.

**Step 2 — Usage tracking interface (OSS, public repo)**

```typescript
// server/src/usage/usage.service.ts
export const USAGE_SERVICE = 'USAGE_SERVICE';

export interface IUsageService {
  track(userId: string, event: string, meta?: Record<string, unknown>): Promise<void>;
}

@Injectable()
export class NoopUsageService implements IUsageService {
  async track() {} // no-op in OSS builds
}
```

Any service that emits events depends only on the interface:

```typescript
// server/src/notes/notes.service.ts
constructor(@Inject(USAGE_SERVICE) private readonly usage: IUsageService) {}

async createNote(userId: string, ...) {
  // ...save note...
  await this.usage.track(userId, 'note.created', { noteId: note.id });
}
```

**Step 3 — EE root module (private repo)**

```typescript
// server/src/ee/ee.module.ts
@Module({
  imports: [
    EeAuthModule,     // overrides AUTH_GUARD with SupabaseAuthGuard
    EeUsageModule,    // overrides USAGE_SERVICE with EeUsageService
    EeAdminModule,    // registers GET /api/admin/*
    EeBillingModule,  // registers POST /api/billing/webhook
    EeOrgsModule,     // registers /api/orgs/*
  ],
})
export class EeModule {}
```

**Step 4 — AppModule loads EE dynamically (OSS, public repo)**

```typescript
// server/src/app.module.ts
@Module({})
export class AppModule {
  static async forRoot(): Promise<DynamicModule> {
    let eeImports: any[] = [];
    try {
      const { EeModule } = await import('./ee/ee.module');
      eeImports = [EeModule];
    } catch { /* OSS build — ee/ not present */ }

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        DatabaseModule,
        AuthModule,
        // ... all OSS feature modules ...
        ...eeImports,
      ],
    };
  }
}
```

```typescript
// server/src/main.ts
const app = await NestFactory.create(await AppModule.forRoot());
```

**Step 5 — EE auth override (private repo)**

```typescript
// server/src/ee/auth/ee-auth.module.ts
@Global()
@Module({
  providers: [
    SupabaseAuthGuard,
    { provide: AUTH_GUARD, useExisting: SupabaseAuthGuard },
  ],
  exports: [AUTH_GUARD],
})
export class EeAuthModule {}
```

NestJS resolves the last registered provider for a token — EE override wins.

**Step 6 — EE usage service (private repo)**

```typescript
// server/src/ee/usage/ee-usage.service.ts
@Injectable()
export class EeUsageService implements IUsageService {
  async track(userId: string, event: string, meta: Record<string, unknown> = {}) {
    await this.db.insert(this.usageEventsTable).values({
      id: crypto.randomUUID(),
      userId,
      event,
      metadata: JSON.stringify(meta),
      createdAt: new Date().toISOString(),
    }).run();
  }
}
```

**Step 7 — EE admin API (private repo, no OSS equivalent)**

No stub needed. Routes simply don't exist in OSS builds — `GET /api/admin/*` returns 404.

```typescript
// server/src/ee/admin/admin.controller.ts
@Controller('api/admin')
@UseGuards(AUTH_GUARD)
export class AdminController {
  @Get('usage')
  getUsage(@Query('from') from: string, @Query('to') to: string) {
    return this.adminService.getUsageReport(from, to);
  }

  @Get('users')
  listUsers(@Query('page') page = 1) {
    return this.adminService.listUsers(page);
  }
}
```

### 7.2 Frontend: component registry pattern

The OSS frontend ships a typed slot registry. The EE `src/ee/register.ts` populates it on boot. The OSS `App.tsx` reads slots and falls back gracefully when they are empty.

**Step 1 — EE registry (OSS, public repo)**

```typescript
// src/lib/ee-registry.ts
import type { ComponentType } from 'react';

type Slot = 'LoginPage' | 'LandingPage' | 'AdminPanel' | 'UsageDashboard' | 'BillingPage';

const registry = new Map<Slot, ComponentType<any>>();

export const eeRegistry = {
  register<T>(slot: Slot, component: ComponentType<T>) {
    registry.set(slot, component as ComponentType<any>);
  },
  get<T>(slot: Slot): ComponentType<T> | null {
    return (registry.get(slot) as ComponentType<T>) ?? null;
  },
};
```

**Step 2 — main.tsx activates EE (OSS, public repo)**

```typescript
// src/main.tsx
import { eeRegistry } from './lib/ee-registry';

try {
  const { registerEe } = await import('./ee/register');
  registerEe(eeRegistry);
} catch { /* OSS build — ee/ not present */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter><App /></BrowserRouter>
);
```

**Step 3 — EE register (private repo)**

```typescript
// src/ee/register.ts
import { lazy } from 'react';
import type { EeRegistry } from '../lib/ee-registry';

export function registerEe(registry: EeRegistry) {
  registry.register('LandingPage',    lazy(() => import('./landing/LandingPage')));
  registry.register('LoginPage',      lazy(() => import('./auth/LoginPage')));
  registry.register('AdminPanel',     lazy(() => import('./admin/AdminPanel')));
  registry.register('UsageDashboard', lazy(() => import('./admin/UsageDashboard')));
  registry.register('BillingPage',    lazy(() => import('./billing/BillingPage')));
}
```

**Step 4 — App.tsx uses registry with fallbacks (OSS, public repo)**

```tsx
// src/App.tsx
import { eeRegistry } from './lib/ee-registry';

const LandingPage = eeRegistry.get('LandingPage');
const AdminPanel  = eeRegistry.get('AdminPanel');

export default function App() {
  return (
    <Routes>
      {/* OSS: redirect / to /home. EE: render SaaS landing page. */}
      <Route path="/" element={
        LandingPage ? <LandingPage /> : <Navigate to="/home" replace />
      } />

      {/* Admin panel only exists in EE build */}
      {AdminPanel && <Route path="/admin/*" element={<AdminPanel />} />}

      <Route path="/home" element={<AuthenticatedApp />} />
      {/* ... all other OSS routes unchanged ... */}
    </Routes>
  );
}
```

**Step 5 — Usage dashboard (private repo)**

```tsx
// src/ee/admin/UsageDashboard.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function UsageDashboard() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/admin/usage?from=...&to=...')
      .then(r => r.json()).then(setData);
  }, []);
  return (
    <div className="admin-page">
      <h1>Usage</h1>
      <BarChart data={data} width={800} height={300}>
        <XAxis dataKey="date" /><YAxis />
        <Tooltip />
        <Bar dataKey="notes_created" />
        <Bar dataKey="ai_calls" />
      </BarChart>
    </div>
  );
}
```

### 7.3 Data flow comparison

```
OSS build (no ee/ directory):
  AppModule     → loads all OSS modules only
  AUTH_GUARD    → LocalAuthGuard (local mode or AUTH_SECRET bearer)
  USAGE_SERVICE → NoopUsageService (no-op)
  eeRegistry    → empty → App.tsx renders OSS fallbacks
  /api/admin/*  → 404

Enterprise build (after CI merge of ee/ into source tree):
  AppModule     → loads all OSS modules + EeModule
  EeModule      → provides EeAuthModule, EeUsageModule, EeAdminModule, EeBillingModule
  AUTH_GUARD    → SupabaseAuthGuard (overrides OSS provider)
  USAGE_SERVICE → EeUsageService (writes to usage_events table)
  eeRegistry    → populated → App.tsx renders LandingPage, LoginPage, AdminPanel
  /api/admin/*  → real admin API
```

### 7.4 File ownership summary

| File | Repo |
|------|------|
| `server/src/auth/auth.guard.interface.ts` | Public |
| `server/src/auth/local-auth.guard.ts` | Public |
| `server/src/auth/auth.module.ts` | Public |
| `server/src/usage/usage.service.ts` (interface + no-op) | Public |
| `server/src/usage/usage.module.ts` | Public |
| `src/lib/ee-registry.ts` | Public |
| `src/main.tsx` (tries `import('./ee/register')`) | Public |
| `server/src/ee/ee.module.ts` | **Private** |
| `server/src/ee/auth/supabase.guard.ts` | **Private** |
| `server/src/ee/auth/ee-auth.module.ts` | **Private** |
| `server/src/ee/usage/ee-usage.service.ts` | **Private** |
| `server/src/ee/admin/admin.controller.ts` | **Private** |
| `server/src/ee/billing/billing.module.ts` | **Private** |
| `src/ee/register.ts` | **Private** |
| `src/ee/auth/LoginPage.tsx` | **Private** |
| `src/ee/landing/LandingPage.tsx` | **Private** |
| `src/ee/admin/UsageDashboard.tsx` | **Private** |

---

## 8. Licensing

### 8.1 OSS core: AGPLv3 (recommended)

AGPLv3's **network-use copyleft clause** means anyone who deploys Knowledge Loom as a hosted service must either open-source their modifications or buy a commercial license. This is the "pay or open source" lever that funds the enterprise tier.

Used by Cal.com, Plane, Documenso, Mattermost (server), Plausible, Umami, Ghost — all comparable hosted products.

**Adds some friction**: enterprise legal teams sometimes require review before accepting AGPL dependencies. For self-hosted enterprise customers (who are already managing their own infrastructure), this friction is lower than for SaaS integrations.

**MIT alternative**: maximally permissive, maximally adopted. A competitor can fork, close-source modifications, and run a competing hosted service. Acceptable if community size is the moat rather than license enforcement.

**Decision rule**:
- Choose **AGPL** if cloud competitors or proprietary forks are a real threat.
- Choose **MIT** if simplicity and maximum adoption outweigh that concern.

### 8.2 EE layer: custom proprietary license

Simplest and most direct:

```
Copyright © Knowledge Loom. All rights reserved.

You may read and audit this source code. You may not use, copy, modify,
or distribute it in production without a valid Knowledge Loom commercial
license. Contact hello@knowledgeloom.app to obtain a license.
```

**BSL 1.1 alternative**: source-available with a time-limited restriction that converts to Apache 2.0 after N years (used by HashiCorp, CockroachDB, MariaDB). Good for community trust ("the code will eventually be free"), but adds legal complexity. For the private EE repo this is less important since the source isn't publicly visible anyway.

### 8.3 Commercial license exception

Pair AGPL with a **commercial license exception** for enterprise customers who want to:
- Embed Knowledge Loom in a proprietary product without AGPL copyleft obligations
- Integrate it into internal tooling that they cannot open-source
- Receive SLA-backed support

This is standard practice: Cal.com, Documenso, and GitLab all sell a commercial license that removes the copyleft obligation for customers who need it.

### 8.4 License file layout

```
/LICENSE                  ← AGPLv3 (or MIT)
/ee/LICENSE               ← Custom proprietary (if ee/ is in the public repo)
```

For the separate private repo approach, the EE repo has its own `LICENSE` at its root — it's never visible in the public repo.

---

## 9. Engineering Roadmap

### Phase 1 — OSS launch (1–2 weeks)

Make the public repo genuinely self-hostable without Supabase:

1. Create `AUTH_GUARD` injection token and `IAuthGuard` interface in `server/src/auth/`.
2. Write `LocalAuthGuard`: local mode (no token needed, `userId='local'`) plus optional `AUTH_SECRET` bearer token for internet-exposed instances.
3. Update `AuthModule` to provide `LocalAuthGuard` as the `AUTH_GUARD` default.
4. Create `USAGE_SERVICE` token, `IUsageService` interface, and `NoopUsageService` in `server/src/usage/`.
5. Create `src/lib/ee-registry.ts` (empty slot registry).
6. Update `src/main.tsx` to try `import('./ee/register')` on boot.
7. Update `server/src/main.ts` to call `AppModule.forRoot()` (dynamic EE loading).
8. Create private repo `knowledge-loom-ee`; move `SupabaseAuthGuard`, `LoginPage.tsx`, `LandingPage.tsx` there.
9. Remove `@supabase/supabase-js` from OSS `package.json`.
10. Write Docker Compose self-hosting guide (no Supabase, no Redis optional, Meilisearch optional).
11. Write CI/CD build script that merges private EE repo into OSS tree for enterprise image.
12. Set `LICENSE` to AGPLv3 at repo root.
13. Add README section: OSS vs Cloud, self-hosting quickstart, commercial license FAQ.

### Phase 2 — Enterprise auth (4–6 weeks)

14. Move `SupabaseAuthGuard` into `knowledge-loom-ee/server/src/ee/auth/`.
15. Write `EeAuthModule` that overrides `AUTH_GUARD` with `SupabaseAuthGuard`.
16. Write `EeModule` that imports `EeAuthModule` (and other EE modules as they're built).
17. Add SSO/OIDC guard using Passport.js + `passport-openidconnect`.
18. Build invite flow (email → account creation) in `ee/orgs/`.
19. Deploy the cloud version pointing at the enterprise Docker image.

### Phase 3 — Org/team model (6–10 weeks)

20. Add `organizations` table: `id`, `name`, `slug`, `plan`, `createdAt`.
21. Add `organization_members` table: `orgId`, `userId`, `role` (owner/admin/member).
22. Extend `SupabaseAuthGuard` to attach `orgId` from JWT claims or DB lookup.
23. Build admin panel (`ee/admin/`): user list, usage metrics, invite management.
24. Add SCIM provisioning endpoint for enterprise IdP integration.

### Phase 4 — Usage tracking and billing (4–6 weeks)

25. Create `usage_events` table in EE schema migration.
26. Implement `EeUsageService` writing events on every tracked API call.
27. Build `GET /api/admin/usage` aggregation endpoint.
28. Build usage dashboard in EE frontend (`src/ee/admin/UsageDashboard.tsx`).
29. Stripe integration (`ee/billing/`): products, prices, subscriptions, webhook handler.
30. Quota enforcement middleware (AI calls per month, storage limit).
31. Billing portal page in EE frontend.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Community builds competing hosted service (OSS fork) | Medium | Medium | AGPL requires them to open-source modifications or buy a license; community hosting grows your brand |
| OSS version lags enterprise and feels like a demo tier | High | High | Commit to keeping all core PKM features in OSS; only auth/billing/admin in EE |
| Auth abstraction adds complexity | Low | Low | `IAuthGuard` is one method (`canActivate`); the interface is 3 lines |
| Build merge CI script fails silently | Medium | High | CI must fail loudly if `ee/` copy step fails; smoke-test EE-only routes in the enterprise image build |
| EE import leaks into OSS codebase over time | Medium | Medium | ESLint `no-restricted-imports` rule on `**/ee/**` paths; checked in CI |
| Community discovers OSS and EE diverge (Cal.com problem) | Low | High | OSS repo IS the production source; EE only adds modules on top, never replaces core behaviour |
| AGPL creates enterprise procurement friction | Medium | Low | Offer commercial license exception as a PDF contract; most self-hosted enterprise customers are already comfortable with self-hosting and understand AGPL |
| Private repo credentials leaked | Low | High | Rotate deploy keys; use GitHub Actions OIDC rather than long-lived tokens; no EE keys in OSS CI |

---

*Generated from codebase audit + industry research across Cal.com, Outline, Plane, Documenso, Mattermost, GitLab, Supabase, and Huly.*
