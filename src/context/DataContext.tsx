import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { PROFILE_MINI } from '../lib/constants';
import type { Connection, MiniProfile, NotificationRow } from '../lib/types';
import { useAuth } from './AuthContext';

export type FriendState = 'none' | 'friends' | 'sent' | 'received';

interface DataState {
  friends: MiniProfile[];
  connections: Connection[];
  people: Record<string, MiniProfile>;
  networkLoading: boolean;
  refreshNetwork: () => Promise<void>;
  friendState: (userId: string) => { state: FriendState; connection?: Connection };
  notifications: NotificationRow[];
  unread: number;
  refreshNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

/** Network (friends, pending requests) and notifications, kept live for the signed-in user. */
export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const me = profile?.id;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [people, setPeople] = useState<Record<string, MiniProfile>>({});
  const [networkLoading, setNetworkLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const refreshNetwork = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status, created_at')
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
      .neq('status', 'declined');
    const conns = (data ?? []) as Connection[];
    const ids = [...new Set(conns.map((c) => (c.requester_id === me ? c.addressee_id : c.requester_id)))];
    const map: Record<string, MiniProfile> = {};
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select(PROFILE_MINI).in('id', ids);
      for (const p of (ps ?? []) as MiniProfile[]) map[p.id] = p;
    }
    // Profiles hidden by a block disappear from the network too.
    setConnections(conns.filter((c) => map[c.requester_id === me ? c.addressee_id : c.requester_id]));
    setPeople(map);
    setNetworkLoading(false);
  }, [me]);

  const refreshNotifications = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, user_id, type, payload, read_at, created_at')
      .eq('user_id', me)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as NotificationRow[]);
  }, [me]);

  useEffect(() => {
    if (!me) return;
    refreshNetwork();
    refreshNotifications();
    const channel = supabase
      .channel(`notifications:${me}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` },
        (payload) => {
          refreshNotifications();
          const type = (payload.new as Partial<NotificationRow>)?.type ?? '';
          if (['friend_request', 'friend_accepted', 'invite_joined'].includes(type)) refreshNetwork();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refreshNetwork, refreshNotifications]);

  const markAllRead = useCallback(async () => {
    if (!me) return;
    const now = new Date().toISOString();
    setNotifications((ns) => ns.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', me).is('read_at', null);
  }, [me]);

  const value = useMemo<DataState>(() => {
    const friends = connections
      .filter((c) => c.status === 'accepted')
      .map((c) => people[c.requester_id === me ? c.addressee_id : c.requester_id])
      .filter(Boolean)
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    return {
      friends,
      connections,
      people,
      networkLoading,
      refreshNetwork,
      friendState: (userId) => {
        const c = connections.find(
          (x) => (x.requester_id === me && x.addressee_id === userId) || (x.addressee_id === me && x.requester_id === userId),
        );
        if (!c) return { state: 'none' };
        if (c.status === 'accepted') return { state: 'friends', connection: c };
        return { state: c.requester_id === me ? 'sent' : 'received', connection: c };
      },
      notifications,
      unread: notifications.filter((n) => !n.read_at).length,
      refreshNotifications,
      markAllRead,
    };
  }, [connections, people, networkLoading, refreshNetwork, notifications, refreshNotifications, markAllRead, me]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}
