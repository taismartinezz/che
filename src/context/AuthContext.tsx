import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PROFILE_COLUMNS } from '../lib/constants';
import type { Profile } from '../lib/types';

interface PrivateData {
  contact_whatsapp: string | null;
  is_admin: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
}

const NO_PRIV: PrivateData = { contact_whatsapp: null, is_admin: false, email_notifications: true, push_notifications: true };

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  priv: PrivateData;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [priv, setPriv] = useState<PrivateData>(NO_PRIV);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setPriv(NO_PRIV);
      return;
    }
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
      supabase.rpc('get_my_private'),
    ]);
    setProfile((p as Profile | null) ?? null);
    const row = Array.isArray(pr) ? pr[0] : pr;
    setPriv({
      contact_whatsapp: row?.contact_whatsapp ?? null,
      is_admin: Boolean(row?.is_admin),
      email_notifications: row?.email_notifications ?? true,
      push_notifications: row?.push_notifications ?? true,
    });
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => {
          loadProfile(s?.user.id).finally(() => setLoading(false));
        }, 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Weekly-active metric: cheap, throttled server-side.
  useEffect(() => {
    if (profile?.onboarded) supabase.rpc('touch_last_seen').then(() => undefined);
  }, [profile?.id, profile?.onboarded]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, priv, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** For screens rendered only after onboarding: profile is guaranteed. */
export function useMe() {
  const { profile, priv } = useAuth();
  if (!profile) throw new Error('useMe without profile');
  return { me: profile, priv };
}
