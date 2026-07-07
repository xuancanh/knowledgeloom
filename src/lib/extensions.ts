/**
 * Extension registry — the frontend seam between the open-source core and
 * optional private extension modules.
 *
 * The OSS build ships this file with nothing registered: useAuth() reports
 * local mode, API calls carry no Authorization header, and App.tsx renders no
 * landing/login routes. An extended build adds `src/extensions/` (from a
 * private repo), whose `register.ts` populates this registry at boot — before
 * React renders — via the import.meta.glob call in main.tsx.
 *
 * Core code must never import from `src/extensions/` (enforced by ESLint).
 */
import type { ComponentType } from 'react';
import type { AuthState } from '../hooks/useAuth';

export interface ExtAuthAdapter {
  /** Hook implementing the full auth state machine (sessions, sign-out). */
  useAuth: () => AuthState;
  /** Returns the bearer token for API calls, or null when unauthenticated. */
  getAccessToken: () => Promise<string | null>;
}

export interface ExtComponentSlots {
  LandingPage?: ComponentType;
  LoginPage?: ComponentType;
}

const slots: ExtComponentSlots = {};
let authAdapter: ExtAuthAdapter | null = null;

export const ext = {
  registerComponents(next: ExtComponentSlots): void {
    Object.assign(slots, next);
  },
  setAuthAdapter(adapter: ExtAuthAdapter): void {
    authAdapter = adapter;
  },
  component<K extends keyof ExtComponentSlots>(slot: K): ExtComponentSlots[K] | undefined {
    return slots[slot];
  },
  authAdapter(): ExtAuthAdapter | null {
    return authAdapter;
  },
};

export type ExtensionsApi = typeof ext;
