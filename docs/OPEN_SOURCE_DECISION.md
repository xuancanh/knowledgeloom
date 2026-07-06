# Open Source Decision — Knowledge Loom

> Supersedes `OPEN_SOURCE_PROPOSAL.md` and `OPENSOURCE_REPORT.md` where they
> disagree. Those two documents share the same audit and industry research but
> reach different structural conclusions; this document resolves the conflicts,
> corrects two technical errors, and defines what was actually implemented.

---

## 1. Review of the two existing documents

### Where they agree (accepted as-is)

- The core PKM product (notes, flashcards, quiz, RAG chat, reminders, graph,
  i18n, search, storage, AI providers) ships as open source with no gating.
- Supabase auth is the only hard coupling; everything else is behind an
  interface (`AiProvider`, `NoteStorageProvider`, `SearchProvider`).
- OSS core license: **AGPLv3** with a commercial-exception offer.
- Phase 1 = a `LocalAuthGuard`-style default, `AUTH_SECRET` bearer support for
  internet-exposed self-hosters, self-hosting docs, an ESLint fence against
  `ee/` imports.

### Where they conflict — and the ruling

| Question | PROPOSAL says | REPORT says | Decision |
|---|---|---|---|
| EE structure | Monorepo `ee/` folder (Pattern A) | Separate private repo + CI merge (Pattern B) | **Pattern B** — implemented (see §2) |
| Core license | Diagram says MIT, §6 says AGPL | AGPLv3 | **AGPLv3** |
| EE source visibility | Source-available in public repo | Never public | **Never public** |

**Why Pattern B**: today there are only ~4 EE-relevant files (the Supabase
guard, the frontend Supabase SDK glue, `LoginPage`, `LandingPage`). A visible
`ee/` directory in a young repo invites "rigged repo" skepticism for zero
present benefit, and the Documenso build-coupling trap is easier to fall into
when the EE code sits in the same tree. A private repo merged at CI time keeps
the public repo 100 % AGPL with no license ambiguity.

**Implementation**: the private repo lives at `../knowledge-loom-ee` and holds
the Supabase auth strategy, the login/landing pages, the Supabase browser
client, and the merge/dev-link scripts. This repo gitignores `src/ee/` and
`server/src/ee/` so linked EE code can never be committed to the public tree.

### Corrections to both documents

1. **`@UseGuards(AUTH_GUARD)` with a string token does not work in NestJS.**
   `@UseGuards()` accepts classes or instances, not injection tokens. The
   working pattern (implemented): a thin `ApiAuthGuard` class that all
   controllers reference, which delegates to an `AUTH_STRATEGY` injection
   token. OSS provides `LocalAuthStrategy` and `SupabaseAuthStrategy`; the
   future EE module overrides the token (e.g. with an SSO strategy) without
   touching any controller.
2. **CLA/DCO is missing from both documents.** Dual licensing (AGPL + commercial
   exception) requires the project to own or be licensed to relicense all
   contributions. Before accepting external PRs, add a DCO requirement
   (lightweight, Linux-kernel style) or a CLA bot. Without this, every outside
   contribution erodes the right to sell the commercial exception.
3. **Pre-publication hygiene was not covered.** Before the repo goes public:
   scan full git history for secrets (`gitleaks` or `trufflehog`), verify
   `knowledge/` never had personal notes committed (currently only `.gitkeep`
   files are tracked — good), and gitignore all runtime SQLite files
   (`reminders.sqlite*` was missing — fixed).

---

## 2. The plan (revised)

### Phase 0 — Decoupling + repo split ✅ implemented

Verified end-to-end: OSS build with no `ee/` (no Supabase in the JS bundle,
local mode and `AUTH_SECRET` bearer both exercised against a running server);
enterprise dev-link build (`link-dev.sh`) with Supabase JWT auth returning
401/200 correctly; boot fails loudly when `AUTH_PROVIDER=supabase` is set
without the EE modules.

1. **Auth strategy split** (`server/src/auth/`):
   - `auth-strategy.interface.ts` — `AuthStrategy` interface + `AUTH_STRATEGY` token.
   - `local-auth.strategy.ts` — OSS default. No config → `userId='local'`;
     `AUTH_SECRET` set → constant-time bearer-token check for internet-exposed
     single-user instances.
   - `supabase-auth.strategy.ts` — the existing Supabase JWT verification,
     now isolated in one file slated for extraction to the private EE repo.
   - `auth.guard.ts` — `ApiAuthGuard` delegates to whichever strategy the
     module provided. Controllers reference only `ApiAuthGuard`.
   - `auth.module.ts` — selects the strategy: `AUTH_PROVIDER=supabase` (or a
     configured `SUPABASE_JWT_SECRET`, for backward compatibility) → Supabase;
     otherwise local.
2. **ESLint fence**: `no-restricted-imports` on `**/ee/**` from non-EE code,
   active now so the rule exists before the first EE file does.
3. **Hygiene**: gitignore runtime SQLite files; `.env.example` documents
   `AUTH_SECRET` / `AUTH_PROVIDER` and marks Supabase as optional/EE.
4. **License**: `LICENSE` (AGPLv3) at the repo root. This is reversible until
   the repo is published; final sign-off on the license is a business decision
   for the owner.
5. **Tests**: unit tests for `LocalAuthStrategy` (local mode, bearer accept /
   reject) and guard delegation.

### Phase 1 — Publication (owner actions, not automatable)

- Run `gitleaks detect` over full history; scrub or squash if anything is found.
- Decide final license (AGPLv3 recommended) and add the commercial-exception
  FAQ to the README.
- Add DCO check (GitHub app or CI step) before accepting external PRs.
- Optionally: fresh-history public repo (`git init` + single initial commit)
  if the private history is not worth auditing.
- Write the Docker Compose self-hosting guide (no Supabase; Meilisearch and
  Redis optional).

### Phase 2+ — EE (unchanged from the REPORT's roadmap)

The `knowledge-loom-ee` private repo now exists with the Supabase code moved
in (`server/src/ee/auth/`, `src/ee/`). Remaining: remove
`@supabase/supabase-js` from the public `package.json` at publication time
(the EE build then supplies it), wire the CI merge for the enterprise image
(`scripts/build-enterprise.sh` is the template), then orgs, admin, usage
tracking, billing per the REPORT's Phases 2–4.

---

## 3. What was intentionally *not* done now

- **Removing `@supabase/supabase-js` from `package.json`** — no OSS source
  imports it anymore, but the dependency stays so the dev-linked EE build
  resolves it from the same node_modules. Drop it (and let the enterprise
  merge add it) when the repo is actually published.
- **Publishing** — requires the owner's license sign-off and history scrub.
