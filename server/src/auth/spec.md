# Auth Module — Spec

**Location**: `server/src/auth/`
**NestJS module**: `AuthModule` (decorated `@Global()`)

---

## Purpose

Authenticates every protected request. The guard is provider-agnostic: it
delegates to whichever `AuthStrategy` the module provides, following the same
pluggable pattern as `AiProvider` / `NoteStorageProvider` / `SearchProvider`.
The module is `@Global()` so the guard and decorator are available everywhere
without explicit imports.

See `docs/tech/OPEN_SOURCE_DECISION.md` for the OSS/extensions split this design serves.

---

## AuthStrategy (`auth-strategy.interface.ts`)

`authenticate(request): string` — returns the user id or throws
`UnauthorizedException`. Provided under the `AUTH_STRATEGY` injection token.

Implementations:

- **LocalAuthStrategy** (`local-auth.strategy.ts`, OSS default)
  - No `AUTH_SECRET` configured → every request gets `userId = 'local'`.
    A log line notes local mode at startup.
  - `AUTH_SECRET` set → requires `Authorization: Bearer <secret>`; the
    comparison is constant-time (`crypto.timingSafeEqual`). Still single-user.
- **SupabaseAuthStrategy** (extensions — `server/src/extensions/auth/`, private repo)
  - Verifies the Supabase JWT locally (HS256, `SUPABASE_JWT_SECRET`), enforces
    expiry, and returns the `sub` claim. 401 for missing/malformed/expired
    tokens or a missing `sub`.

## Strategy selection (`auth.module.ts`)

| Condition | Strategy |
|---|---|
| `AUTH_PROVIDER=supabase` or `SUPABASE_JWT_SECRET` set | SupabaseAuthStrategy (dynamic import from `extensions/`) |
| otherwise | LocalAuthStrategy |

If an extensions provider is requested but `extensions/` is not present in the build, **boot
fails loudly** — the server never silently degrades to unauthenticated local
mode.

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `AUTH_PROVIDER` | `local` | `local` or `supabase` (extensions) |
| `AUTH_SECRET` | — | Optional bearer token for the local provider |
| `SUPABASE_JWT_SECRET` | — | HS256 secret (extensions; implies `supabase` provider) |

---

## ApiAuthGuard (`auth.guard.ts`)

NestJS `CanActivate` guard — calls the active strategy and attaches the
returned id to `request.userId`.

**Apply** with `@UseGuards(ApiAuthGuard)` on a controller or route.
For write endpoints that also need read-only enforcement, stack both:
`@UseGuards(ApiAuthGuard, WritableGuard)`.

---

## @CurrentUser() decorator

Parameter decorator that extracts the authenticated user's ID from the request
(as set by `ApiAuthGuard`).

**Usage:**
```typescript
@Get(':id')
@UseGuards(ApiAuthGuard)
async getNote(@Param('id') id: string, @CurrentUser() userId: string) {
  return this.notesService.getMarkdown(userId, id);
}
```

Returns the `userId` string from `request.userId`. The guard must be applied
to the route before this decorator can extract the value.

---

## AuthenticatedRequest

Extends Express `Request` with a `userId: string` property. Used as the generic
type parameter for `ExecutionContext.switchToHttp().getRequest<AuthenticatedRequest>()`.

---

## BDD Spec

### Feature: Local authentication (OSS)

**Scenario: Local mode when no secret is configured**
- GIVEN `AUTH_SECRET` is not set (and no extensions provider is selected)
- WHEN any request reaches a guarded route
- THEN the guard sets `request.userId = 'local'` and returns `true`

**Scenario: Bearer secret accepted**
- GIVEN `AUTH_SECRET=s3cret`
- WHEN a request arrives with `Authorization: Bearer s3cret`
- THEN the guard sets `request.userId = 'local'`

**Scenario: Bearer secret rejected**
- GIVEN `AUTH_SECRET=s3cret`
- WHEN a request arrives with no token, a wrong token, or a non-Bearer scheme
- THEN the guard throws `UnauthorizedException`

### Feature: extensions provider selection

**Scenario: Supabase requested without extensions/**
- GIVEN `AUTH_PROVIDER=supabase` (or `SUPABASE_JWT_SECRET` set) in an OSS build
- WHEN the server boots
- THEN boot fails with an error naming the missing extensions modules

### Feature: JWT authentication (extensions — SupabaseAuthStrategy)

**Scenario: Valid Bearer token**
- GIVEN `SUPABASE_JWT_SECRET` is set and the extensions modules are present
- WHEN a request arrives with a valid, unexpired JWT whose `sub` is a non-empty string
- THEN the guard sets `request.userId` to the `sub` value

**Scenario: Missing / expired / malformed token, or no `sub` claim**
- THEN the guard throws `UnauthorizedException` (HTTP 401)

### Feature: CurrentUser decorator

**Scenario: Extract userId from authenticated request**
- GIVEN a request was authenticated by `ApiAuthGuard`
- WHEN a controller method uses `@CurrentUser() userId: string`
- THEN `userId` equals the value of `request.userId`
