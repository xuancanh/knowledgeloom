/**
 * useAuth — auth state for the app shell.
 *
 * OSS builds have no identity provider: the hook reports local mode and the
 * backend treats every request as userId='local'. Extensions builds register
 * an EeAuthAdapter (see src/lib/extensions.ts) whose useAuth implementation takes
 * over entirely.
 */
import { ee } from '../lib/ee';

export interface AuthState {
  /** Provider-specific user object, or null in local mode. */
  user: { email?: string } | null;
  loading: boolean;
  /** True when running without an identity provider — no login required, userId is "local". */
  localMode: boolean;
  /** Convenience: true when either authenticated via a provider or in local mode. */
  authenticated: boolean;
  signOut: () => Promise<void>;
}

const LOCAL_STATE: AuthState = {
  user: null,
  loading: false,
  localMode: true,
  authenticated: true,
  signOut: async () => {},
};

export function useAuth(): AuthState {
  const adapter = ee.authAdapter();
  // The adapter is registered before React renders (main.tsx) and never
  // changes afterwards, so this branch is stable across renders and does not
  // violate the rules of hooks.
  if (adapter) return adapter.useAuth();
  return LOCAL_STATE;
}
