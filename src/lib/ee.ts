/**
 * EE registry — the frontend seam between the open-source core and the
 * private enterprise modules (see docs/OPEN_SOURCE_DECISION.md).
 *
 * The OSS build ships this file with nothing registered: useAuth() reports
 * local mode, API calls carry no Authorization header, and App.tsx renders no
 * landing/login routes. The enterprise build adds `src/ee/` (merged from the
 * private repo), whose `register.ts` populates this registry at boot — before
 * React renders — via the import.meta.glob call in main.tsx.
 *
 * OSS code must never import from `src/ee/` (enforced by ESLint).
 */
import type { ComponentType } from 'react';
import type { AuthState } from '../hooks/useAuth';

export interface EeAuthAdapter {
  /** Hook implementing the full auth state machine (sessions, sign-out). */
  useAuth: () => AuthState;
  /** Returns the bearer token for API calls, or null when unauthenticated. */
  getAccessToken: () => Promise<string | null>;
}

export interface EeComponentSlots {
  LandingPage?: ComponentType;
  LoginPage?: ComponentType;
}

const slots: EeComponentSlots = {};
let authAdapter: EeAuthAdapter | null = null;

export const ee = {
  registerComponents(next: EeComponentSlots): void {
    Object.assign(slots, next);
  },
  setAuthAdapter(adapter: EeAuthAdapter): void {
    authAdapter = adapter;
  },
  component<K extends keyof EeComponentSlots>(slot: K): EeComponentSlots[K] | undefined {
    return slots[slot];
  },
  authAdapter(): EeAuthAdapter | null {
    return authAdapter;
  },
};

export type EeApi = typeof ee;
