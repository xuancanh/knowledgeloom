import { useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/** True when VITE_SUPABASE_URL is not configured — auth is skipped entirely. */
export const LOCAL_MODE = !import.meta.env.VITE_SUPABASE_URL;

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when running without Supabase — no login required, userId is "local". */
  localMode: boolean;
  /** Convenience: true when either authenticated via Supabase or in local mode. */
  authenticated: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!LOCAL_MODE);

  useEffect(() => {
    if (LOCAL_MODE) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (!LOCAL_MODE) await supabase.auth.signOut();
  };

  return {
    session,
    user: session?.user ?? null,
    loading,
    localMode: LOCAL_MODE,
    authenticated: LOCAL_MODE || session !== null,
    signOut,
  };
}
