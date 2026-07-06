/**
 * Spaces — client-side helpers for the active space.
 *
 * The active space id is kept in localStorage and sent to the backend as the
 * `x-space-id` header on every API call (see api.ts). Switching spaces
 * reloads the app so every view refetches under the new scope.
 */

export interface Space {
  id: string;
  name: string;
  builtin: boolean;
  createdAt?: string;
}

export const DEFAULT_SPACE_ID = 'default';

const STORAGE_KEY = 'kl.spaceId';

export function currentSpaceId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SPACE_ID;
  } catch {
    return DEFAULT_SPACE_ID;
  }
}

export function setCurrentSpaceId(id: string): void {
  try {
    if (id === DEFAULT_SPACE_ID) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing — the switcher still works for the session default.
  }
}

/** Switch space and reload so all data refetches under the new scope. */
export function switchSpace(id: string): void {
  setCurrentSpaceId(id);
  window.location.assign('/');
}
