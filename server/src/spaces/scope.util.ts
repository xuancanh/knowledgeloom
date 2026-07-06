/**
 * Scope keys — how spaces piggyback on the existing per-user data isolation.
 *
 * Every repository, file path, search index, and job payload in the app is
 * keyed by a single opaque string (historically the user id). Spaces reuse
 * that key: the default space keeps the bare user id (so pre-spaces data
 * needs no migration), and every additional space uses `userId~spaceId`.
 *
 * `~` is safe in directory names, SQLite/PG text keys, and Meilisearch index
 * uids (which sanitise it to `_`), and never appears in real user ids
 * ('local' or a UUID). ApiAuthGuard rejects any user id containing it.
 */

export const SCOPE_SEPARATOR = '~';

/** The implicit space every user starts with. Not stored in the spaces table. */
export const DEFAULT_SPACE_ID = 'default';
export const DEFAULT_SPACE_NAME = 'Personal';

/** Space ids are server-generated: lowercase alphanumerics + dashes. */
export const SPACE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Builds the data-scope key for a user + space pair. */
export function scopeFor(userId: string, spaceId?: string | null): string {
  if (!spaceId || spaceId === DEFAULT_SPACE_ID) return userId;
  return `${userId}${SCOPE_SEPARATOR}${spaceId}`;
}

/** Extracts the owning user id from a scope key. */
export function ownerOf(scopeId: string): string {
  const idx = scopeId.indexOf(SCOPE_SEPARATOR);
  return idx === -1 ? scopeId : scopeId.slice(0, idx);
}

/** Extracts the space id from a scope key ('default' for the bare user id). */
export function spaceIdOf(scopeId: string): string {
  const idx = scopeId.indexOf(SCOPE_SEPARATOR);
  return idx === -1 ? DEFAULT_SPACE_ID : scopeId.slice(idx + SCOPE_SEPARATOR.length);
}
