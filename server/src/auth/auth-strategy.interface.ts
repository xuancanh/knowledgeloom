/**
 * AuthStrategy — abstract interface for request authentication.
 *
 * Decouples controllers from any specific identity provider, following the
 * same pattern as AiProvider / NoteStorageProvider / SearchProvider.
 * ApiAuthGuard delegates to whichever strategy AuthModule provides:
 *
 *  - LocalAuthStrategy    — OSS default: single-user local mode, with an
 *                           optional AUTH_SECRET bearer token.
 *  - SupabaseAuthStrategy — Supabase JWT verification (cloud deployments;
 *                           lives in the private extension modules).
 *
 * An extension module overrides AUTH_STRATEGY (e.g. SSO/OIDC) without touching
 * any controller.
 */
import type { Request } from 'express';

export interface AuthStrategy {
  /**
   * Authenticates the request and returns the user id, or throws
   * UnauthorizedException. Never returns a falsy value on success.
   */
  authenticate(request: Request): string;
}

/** Injection token for the active AuthStrategy. */
export const AUTH_STRATEGY = 'AUTH_STRATEGY';
