# Open Core Proposal — Knowledge Loom

> **Goal**: Open-source the core PKM product under AGPLv3; keep auth, billing,
> multi-tenancy, and cloud-operations features in a private `ee/` layer under
> a commercial license. This document covers the architecture audit, industry
> research, recommended strategy, and the concrete engineering changes needed.

---

## 1. Current Architecture Audit

### What exists today

| Layer | Component | Enterprise-relevant? |
|-------|-----------|---------------------|
| Auth | `SupabaseAuthGuard` — verifies Supabase JWT; falls back to `userId='local'` when no secret is set | **Yes** — Supabase is a hard dependency |
| Auth | `useAuth.ts` / `LoginPage.tsx` / `supabase.ts` — Supabase SDK on the frontend | **Yes** |
| Auth | `LandingPage.tsx` — SaaS marketing page | **Yes** |
| Storage | `LocalNoteStorage` (filesystem) | No — ship OSS |
| Storage | `S3NoteStorage` (S3-compatible) | Borderline — ship OSS |
| DB | SQLite (`better-sqlite3`) + PostgreSQL (`pg` + Drizzle) | No — ship OSS |
| AI | `CodexAiProvider` (Codex CLI) | No — ship OSS |
| AI | `OpenRouterAiProvider` (any OpenAI-compatible HTTP API) | No — ship OSS |
| Search | `InMemorySearchProvider` / `MeilisearchProvider` | No — ship OSS |
| Features | Notes, flashcards, quiz, reminders, RAG chat, graph, i18n | No — ship OSS |
| Infra | Redis/BullMQ (job queue) | No — ship OSS |
| User data | All tables namespaced by `userId` | Architecture is ready |
| Billing | Nothing | **Missing — EE only** |
| Org/teams | Nothing | **Missing — EE only** |
| Admin | Nothing | **Missing — EE only** |
| Usage tracking | Nothing | **Missing — EE only** |

### Key observations

1. **Auth is the only hard coupling.** Supabase is wired in two places: the
   backend JWT guard and the frontend SDK. Everything else is already behind
   an interface (`AiProvider`, `NoteStorageProvider`, `SearchProvider`).

2. **Local mode is a complete, working OSS story.** When `SUPABASE_JWT_SECRET`
   is unset, the server accepts all requests as `userId='local'`. The frontend
   skips the login flow entirely. This already works for single-user
   self-hosters — it just isn't packaged or documented as such.

3. **Multi-tenancy is implemented but gated behind auth.** Every database table
   has a `userId` column. File paths are `users/{userId}/notes/`. The data
   model is already multi-tenant; only the auth that enforces it is missing
   from the OSS layer.

4. **Nothing to "hide" in terms of core features.** There is no billing,
   SSO, SAML, admin panel, or org management to extract — they don't exist yet.
   The split is about building new enterprise features in the right place from
   the start.

---

## 2. Industry Research

Research across 8 comparable open-source projects (Cal.com, Outline, Plane,
Documenso, Mattermost, GitLab, Supabase, Huly) reveals four structural patterns:

### Pattern A — Monorepo + `ee/` folder (Cal.com, Documenso, GitLab)

Single repo with an `ee/` directory under a separate commercial license. Everything
outside `ee/` is OSI-approved (AGPL or MIT). A runtime license-key check gates
features. This is the dominant pattern, championed by Open Core Ventures.

**The one rule that makes it work**: OSS code never imports from `ee/`; EE code
may freely import from OSS. Enforced via ESLint `no-restricted-imports`.

**Cal.com cautionary tale**: Cal.com went MIT → AGPL+EE → production codebase
diverged from public repo → Cal.diy stripped-down fork. Community trust eroded
severely when the divergence was discovered. The lesson: if your production
build uses features that aren't in the public repo, the community eventually
notices and feels deceived. The fix is keeping the OSS repo as the true source
of production code.

**Documenso anti-pattern**: Their `packages/ee/` is imported in the AGPL core —
you cannot compile without it. This means there is no clean pure-AGPL build
path, creating legal ambiguity and community frustration. **Avoid this.**

**GitLab gold standard**: `prepend_mod` (Ruby) and `ee_else_ce` (JS) let EE
modules extend CE classes without any CE file directly referencing EE code.
Deleting `ee/` produces a fully functional CE build. This is the architecture
to emulate.

### Pattern B — Separate repos (Plane)

AGPL community repo + private enterprise repo that builds atop CE via OpenFeature
flags. Clean separation but dual maintenance burden. Best when the enterprise
product is architecturally distinct.

### Pattern C — BSL / source-available (Outline)

Single codebase, BSL 1.1 (converts to Apache 2.0 in 2030). No feature gating —
the license itself blocks commercial hosting. **Not recommended**: BSL is not
OSI-approved, blocks enterprise procurement in regulated industries, and is
widely perceived as "not real open source."

### Pattern D — Apache 2.0, no EE layer (Supabase, Huly)

All code permissively licensed; enterprise differentiation comes from managed
operations (PITR, branching, read replicas) that are difficult to self-replicate.
Only works if your moat is operational complexity, not features.

### What is universally EE across all 8 projects

These features are gated across every project studied — they are the validated
enterprise feature set:

1. SSO / SAML 2.0 / OIDC / SCIM provisioning
2. Audit logs and eDiscovery / compliance export
3. High availability and horizontal scaling
4. Compliance certifications (SOC 2, HIPAA, ISO 27001)
5. Advanced analytics / reporting dashboards
6. Air-gapped / offline deployment
7. Multi-tenancy and org/team governance
8. AI features (in newer projects)

What **always stays free** in every OSS project: core CRUD, REST API, webhooks,
basic auth (email/password, OAuth), and self-hosting support. Gating any of
these kills community adoption.

### Recommendation for Knowledge Loom

**Monorepo + `ee/` folder** (Pattern A), following GitLab's clean separation
discipline. Single CI/CD pipeline, one developer workflow, easy upgrade path for
customers, no accidental leakage risk if you enforce the import rule via ESLint.

---

## 3. Recommended Strategy

### Repo structure

```
knowledge-loom/               ← public repo (MIT license)
├── server/
│   └── src/
│       ├── auth/
│       │   ├── auth.guard.interface.ts   ← NEW: abstract IAuthGuard
│       │   ├── local-auth.guard.ts       ← NEW: replaces SupabaseAuthGuard in OSS
│       │   └── auth.module.ts            ← updated: uses LocalAuthGuard by default
│       ├── ee/                           ← EE directory (commercial license)
│       │   ├── auth/
│       │   │   ├── supabase.guard.ts     ← moved here from auth/
│       │   │   └── sso.guard.ts          ← future: SAML / OIDC
│       │   ├── billing/
│       │   │   └── billing.module.ts     ← future: Stripe webhooks, quota
│       │   ├── admin/
│       │   │   └── admin.module.ts       ← future: user management API
│       │   ├── usage/
│       │   │   └── usage.module.ts       ← future: per-user AI cost tracking
│       │   └── orgs/
│       │       └── orgs.module.ts        ← future: workspaces, sharing
│       └── ... (all current modules unchanged)
├── src/                      ← frontend
│   ├── ee/                   ← EE frontend (commercial license)
│   │   ├── auth/
│   │   │   └── SupabaseLoginPage.tsx     ← moved here
│   │   └── landing/
│   │       └── LandingPage.tsx           ← moved here (SaaS marketing)
│   ├── lib/
│   │   └── supabase.ts       ← moved to src/ee/ or removed from OSS build
│   └── ... (all current components unchanged)
├── LICENSE                   ← MIT
├── ee/
│   └── LICENSE               ← Custom commercial / BSL 1.1
└── ...
```

### The one rule that makes this work

> **OSS code never imports from `ee/`. EE code may import from OSS.**

Enforced by an ESLint rule (`no-restricted-imports` on `**/ee/**` paths in non-ee files).
This is exactly what Cal.com does and it scales to any team size.

---

## 4. The Auth Split (Most Critical Change)

This is the only real engineering change needed to ship the OSS version.

### Step 1 — Create `IAuthGuard` interface

```typescript
// server/src/auth/auth.guard.interface.ts
export interface IAuthGuard {
  canActivate(ctx: ExecutionContext): boolean | Promise<boolean>;
}
export const AUTH_GUARD = 'AUTH_GUARD';
```

### Step 2 — Create `LocalAuthGuard` (OSS default)

Replaces `SupabaseAuthGuard` as the default in the OSS build.

```typescript
// server/src/auth/local-auth.guard.ts
@Injectable()
export class LocalAuthGuard implements CanActivate {
  private readonly secret: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.secret = config.get<string>('authSecret'); // AUTH_SECRET env var
  }

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();

    if (!this.secret) {
      // No secret configured → local mode, single user
      request.userId = 'local';
      return true;
    }

    // Simple bearer token auth for internet-exposed self-hosted instances
    const token = request.headers['authorization']?.split(' ')[1];
    if (token !== this.secret) throw new UnauthorizedException();
    request.userId = 'local';
    return true;
  }
}
```

### Step 3 — Move `SupabaseAuthGuard` to `ee/`

```typescript
// server/src/ee/auth/supabase.guard.ts
// (same code as current auth.guard.ts, just relocated)
```

### Step 4 — Make `AuthModule` switchable

```typescript
// server/src/auth/auth.module.ts
const authGuardProvider = {
  provide: AUTH_GUARD,
  useClass: process.env.AUTH_PROVIDER === 'supabase'
    ? SupabaseAuthGuard   // from ee/
    : LocalAuthGuard,     // OSS default
};
```

> In practice, the EE build uses a separate `AppModule` (or `EeModule`) that
> overrides this provider — no `if` statements in OSS code.

### Step 5 — Frontend auth

OSS frontend: remove `@supabase/supabase-js` dependency entirely. The app
always boots into local mode. No login page, no session management.

EE frontend: `src/ee/auth/` exports `SupabaseLoginPage` and wires `supabase.ts`.
The EE build's `App.tsx` imports from `ee/auth/` and renders the login flow.

---

## 5. Feature Classification

### Always OSS (MIT)

| Feature | Rationale |
|---------|-----------|
| Note CRUD, categories, tags, graph | Core PKM, drives adoption |
| AI research / link capture (Codex, OpenRouter, Ollama) | Community value, ecosystem fit |
| Flashcards + spaced repetition (SM-2) | Differentiator, keep open |
| Quiz (fill-blank, multiple choice, short answer) | Same |
| RAG chat over notes | Same |
| Reminders | Core utility |
| Full-text search (Meilisearch + in-memory fallback) | Infrastructure |
| Local filesystem + S3 note storage | Self-hosting story |
| SQLite + PostgreSQL database | Self-hosting story |
| i18n (9 locales) | Community |
| Single-user local mode (no auth required) | Primary OSS deployment model |
| Simple API-key auth (`AUTH_SECRET`) | Self-hosters who expose to internet |
| Docker / self-hosting documentation | Community |

### Enterprise only (commercial license)

| Feature | Rationale |
|---------|-----------|
| Supabase JWT authentication | Vendor-specific, cloud-oriented |
| SSO / SAML 2.0 / OIDC | Classic enterprise gate |
| Social OAuth (Google, GitHub, Microsoft) | Convenience, signals commercial intent |
| Multi-user / organization / workspace model | Team use cases |
| Note sharing within an org | Requires org model |
| Admin panel (user management, quota, audit) | Ops tooling |
| Billing / Stripe integration | Revenue |
| Per-user AI usage tracking and quotas | Cost control |
| Email notifications (reminders via email) | Cloud service |
| Audit logs | Compliance |
| SaaS landing page | Marketing |
| Managed cloud service | Cloud product |

### Borderline (ship OSS, monetize at the cloud layer)

| Feature | Notes |
|---------|-------|
| S3 storage backend | Already in OSS; cloud just pre-configures it |
| PostgreSQL backend | Same pattern |
| Redis / BullMQ job queue | Same |
| Meilisearch | Same |

These are infrastructure choices, not features. Giving them away builds
trust. The cloud product's value is managed operations, not locked-in features.

---

## 6. Licensing Recommendation

**OSS core**: **AGPLv3** (recommended) or MIT

AGPLv3 is the right choice for a hosted PKM/AI product:
- The **network-use copyleft clause** means anyone who deploys Knowledge Loom
  as a hosted service must either open-source their modifications or buy a
  commercial license. This is the "pay or open source" lever that funds the EE.
- Used by Cal.com, Plane, Documenso, Mattermost, Plausible, Umami, Ghost.
- Adds some enterprise-procurement friction (legal review needed), but your
  self-hosted enterprise customers are already comfortable with self-hosting,
  so AGPL is less of a barrier than it would be for a library.

MIT is simpler but weaker: a competitor can fork Knowledge Loom, close-source
their modifications, and run a competing hosted service. For a PKM with a strong
community flywheel that's acceptable; for a product where you want commercial
differentiation, AGPL is safer.

**Decision matrix:**
- Choose **AGPL** if: cloud competitors are a threat, you want the community to
  know you're serious about the commercial deal, you plan to offer a
  "no-AGPL-obligation" commercial license to enterprise customers.
- Choose **MIT** if: maximum adoption and simplicity outweigh cloud-competitor
  risk, your moat is community size rather than license enforcement.

**`ee/` folder**: **Custom proprietary license** (simplest) or **BSL 1.1**

A custom proprietary license is the easiest to write and reason about:

```
Copyright © Knowledge Loom. All rights reserved.
You may read and audit this code. You may not use it in production
without a Knowledge Loom commercial license.
```

BSL 1.1 adds a time-limited source-available clause that converts to OSS after
N years (used by HashiCorp, CockroachDB) — good for community trust, but
adds legal complexity. Avoid BSL for the *core* codebase (see Section 2 —
Pattern C risks).

**Final recommendation**: **AGPLv3 for core + custom proprietary for `ee/`.**
This is the Cal.com/Documenso/Plane pattern and is well understood in the
developer community. Add a commercial license FAQ in the README explaining
that the AGPL commercial exception is available for enterprises.

---

## 7. Engineering Roadmap

### Phase 1 — OSS launch (1–2 weeks)

These changes make the OSS version genuinely self-hostable without Supabase:

1. **Create `IAuthGuard` interface** and inject token in `AuthModule`.
2. **Write `LocalAuthGuard`** (local mode + optional `AUTH_SECRET` bearer token).
3. **Move `SupabaseAuthGuard` to `server/src/ee/auth/`**.
4. **Remove `@supabase/supabase-js` from OSS frontend build** (or gate with build flag).
5. **Move `LoginPage.tsx` and `LandingPage.tsx` to `src/ee/`**.
6. **Write OSS self-hosting guide**: Docker Compose, env vars, no Supabase required.
7. **Add ESLint rule** preventing OSS files from importing `ee/`.
8. **Update `README.md`**: clear OSS vs Cloud distinction, self-hosting instructions, AGPL commercial-exception FAQ.
9. **Add `ee/LICENSE`** with custom proprietary license text.
10. **Set `LICENSE`** at repo root to AGPLv3 (or MIT if simpler split is preferred — see Section 6).

### Phase 2 — Enterprise auth foundation (4–6 weeks)

11. Move `SupabaseAuthGuard` into the EE module, wire it with the auth interface.
12. Build `EeAuthModule` that the cloud deployment uses instead of `AuthModule`.
13. Add SSO/OIDC guard (Passport.js + `passport-openidconnect`).
14. Build invite flow (email → account creation) in `ee/orgs/`.
15. Deploy the cloud version pointing at `ee/` modules.

### Phase 3 — Org model (6–10 weeks)

16. `organizations` table: `id`, `name`, `slug`, `plan`, `createdAt`.
17. `organization_members` table: `orgId`, `userId`, `role` (owner/admin/member).
18. Extend all existing tables with optional `orgId` FK.
19. Extend `SupabaseAuthGuard` to attach `orgId` from JWT claims or a DB lookup.
20. Build admin panel (`ee/admin/`): user list, usage, invite management.

### Phase 4 — Billing (4–6 weeks)

21. Stripe integration (`ee/billing/`): products, prices, subscriptions.
22. Webhook handler for subscription events.
23. Quota enforcement middleware (AI calls per month, storage limit).
24. Billing portal page in EE frontend.

---

## 8. What to Do with the Current Supabase Coupling

Until Phase 1 is done, the repo is not cleanly OSS-ready. The concrete things
that need to change before the first public push:

### Backend
- `server/src/auth/auth.guard.ts` → split into `local-auth.guard.ts` (here) + `ee/auth/supabase.guard.ts`
- `server/src/config/configuration.ts` → remove `supabaseUrl`, `supabaseJwtSecret`, `supabaseAnonKey` from the OSS config (move to EE config)
- `server/src/app.module.ts` → no change needed; auth is injected

### Frontend
- `src/lib/supabase.ts` → move to `src/ee/lib/supabase.ts`
- `src/hooks/useAuth.ts` → split: OSS version always returns `authenticated: true`, `localMode: true`
- `src/components/auth/LoginPage.tsx` → move to `src/ee/components/auth/`
- `src/components/landing/LandingPage.tsx` → move to `src/ee/components/landing/`
- `src/App.tsx` → OSS version doesn't render `LoginPage` or `LandingPage`; routes start at `/home`

### Dependencies
- `@supabase/supabase-js` → move to `ee/package.json` or gate with build-time env

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Community builds competing hosted service using OSS code | AGPL instead of MIT forces them to open-source modifications; or accept it — community hosting grows your brand |
| EE directory makes repo feel "rigged" | Be transparent in README: list exactly what's EE-only; avoid putting core features in EE |
| Maintaining two auth paths creates test surface | Integration tests for both auth modes; CI matrix |
| BSL is unfamiliar to enterprise legal teams | Offer commercial license as simple PDF with clear terms |
| Auth abstraction introduces complexity | The interface has one method (`canActivate`) — it's 10 lines of code |

---

## 10. Summary

The codebase is **already well-structured for this split**. The pluggable AI,
storage, and search providers demonstrate the right pattern. Auth is the only
hard coupling, and it's concentrated in two files on each side.

**The minimum viable change to publish the OSS repo**:
1. `LocalAuthGuard` replaces `SupabaseAuthGuard` as the default.
2. Supabase SDK removed from OSS frontend.
3. README explains local mode, Docker, and `AUTH_SECRET`.
4. `LICENSE` set to AGPLv3 at repo root.
5. `ee/LICENSE` added with custom proprietary text.
6. ESLint rule blocking OSS imports of `ee/` in place.

That's it. The product works today without Supabase — it just isn't packaged
that way. The engineering cost is low (est. 1–2 weeks); the community upside
is high. The AGPL + commercial license pairing is the validated model used by
Cal.com, Plane, Documenso, and GitLab for exactly this type of product.
