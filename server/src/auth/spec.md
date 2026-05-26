# Auth Module — Spec

**Location**: `server/src/auth/`
**NestJS module**: `AuthModule` (decorated `@Global()`)

---

## Purpose

Authenticates every protected request by validating a Supabase-issued JWT locally.
The module is `@Global()` so the guard and decorator are available everywhere without
explicit imports.

---

## SupabaseAuthGuard

NestJS `CanActivate` guard — validates the Bearer token on every guarded request.

**Apply** with `@UseGuards(SupabaseAuthGuard)` on a controller or route.
For write endpoints that also need read-only enforcement, stack both:
`@UseGuards(SupabaseAuthGuard, WritableGuard)`.

### Behavior

1. If `SUPABASE_JWT_SECRET` is not set → **local mode**: every request gets
   `userId = 'local'` and the guard always returns `true`. A warning is logged
   at startup.
2. If the secret is set → extracts the `Authorization: Bearer <token>` header,
   verifies the JWT signature with `jsonwebtoken.verify()`, and attaches the
   `sub` claim to `request.userId`.
3. Returns **HTTP 401** for missing, malformed, or expired tokens.
4. Returns **HTTP 401** if the JWT payload has no `sub` claim or it is not a string.

### Security properties

- Signature verified **locally** — no round-trip to Supabase on every request.
- JWT expiry (`exp`) is enforced by the `jsonwebtoken` library.
- The `extractToken` helper rejects non-Bearer schemes and empty tokens.

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `SUPABASE_JWT_SECRET` | — | HS256 secret for local JWT verification |

---

## @CurrentUser() decorator

Parameter decorator that extracts the authenticated user's ID from the request
(as set by `SupabaseAuthGuard`).

**Usage:**
```typescript
@Get(':id')
@UseGuards(SupabaseAuthGuard)
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

## Module wiring

`AuthModule` is `@Global()` — it registers and exports `SupabaseAuthGuard` so
any controller can use it without importing `AuthModule` explicitly.

---

## BDD Spec

### Feature: JWT Authentication

**Scenario: Local mode when JWT secret is unset**
- GIVEN `SUPABASE_JWT_SECRET` is not set
- WHEN any request reaches a guarded route
- THEN the guard sets `request.userId = 'local'` and returns `true`
- AND a warning is logged at startup

**Scenario: Valid Bearer token**
- GIVEN `SUPABASE_JWT_SECRET` is set to a valid HS256 secret
- WHEN a request arrives with `Authorization: Bearer <valid-jwt>`
- AND the JWT `sub` claim is a non-empty string
- AND the JWT is not expired
- THEN the guard sets `request.userId` to the `sub` value and returns `true`

**Scenario: Missing Authorization header**
- GIVEN `SUPABASE_JWT_SECRET` is set
- WHEN a request arrives with no `Authorization` header
- THEN the guard throws `UnauthorizedException('Missing authorization token')`

**Scenario: Expired token**
- GIVEN `SUPABASE_JWT_SECRET` is set
- WHEN a request arrives with an expired JWT
- THEN the guard throws `UnauthorizedException` with the JWT error message

**Scenario: Token with no sub claim**
- GIVEN `SUPABASE_JWT_SECRET` is set
- WHEN a request arrives with a valid JWT that has no `sub` claim
- THEN the guard throws `UnauthorizedException('Token missing user identity')`

**Scenario: Non-Bearer scheme**
- GIVEN `SUPABASE_JWT_SECRET` is set
- WHEN a request arrives with `Authorization: Basic <token>`
- THEN the guard throws `UnauthorizedException('Missing authorization token')`

### Feature: CurrentUser decorator

**Scenario: Extract userId from authenticated request**
- GIVEN a request was authenticated by `SupabaseAuthGuard`
- WHEN a controller method uses `@CurrentUser() userId: string`
- THEN `userId` equals the value of `request.userId`

**Scenario: Extract userId without prior guard**
- GIVEN no guard has set `request.userId`
- WHEN a controller method uses `@CurrentUser() userId: string`
- THEN `userId` is `undefined`
