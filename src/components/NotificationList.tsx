import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { timeAgo } from '../lib/time';
import type { IntroRequest, NotificationRow } from '../lib/types';
import { useOpenWhatsApp } from '../hooks/useOpenWhatsApp';
import Avatar from './Avatar';
import RichText from './RichText';
import { RowSkeleton } from './States';

const KNOWN = [
  'friend_request',
  'friend_accepted',
  'invite_joined',
  'offer',
  'intro_via',
  'intro_target',
  'intro_via_accepted',
  'intro_accepted',
  'intro_declined',
  'exchange',
  'endorsement',
  'message',
  'verification_approved',
  'verification_rejected',
];

export default function NotificationList({ limit, onNavigate }: { limit?: number; onNavigate?: () => void }) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { notifications, friendState, refreshNetwork, refreshNotifications } = useData();
  const { toastError } = useUI();
  const navigate = useNavigate();
  const openWhatsApp = useOpenWhatsApp();
  const [intros, setIntros] = useState<Record<string, IntroRequest>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const list = limit ? notifications.slice(0, limit) : notifications;
  const introIds = [...new Set(list.map((n) => n.payload.intro_id).filter(Boolean))] as string[];
  const introKey = introIds.join(',');

  useEffect(() => {
    let active = true;
    (async () => {
      if (introIds.length) {
        const { data } = await supabase.from('intro_requests').select('*').in('id', introIds);
        if (active) setIntros(Object.fromEntries(((data ?? []) as IntroRequest[]).map((i) => [i.id, i])));
      }
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      if (introIds.length) {
        const { data } = await supabase.from('intro_requests').select('*').in('id', introIds);
        setIntros(Object.fromEntries(((data ?? []) as IntroRequest[]).map((i) => [i.id, i])));
      }
      await Promise.all([refreshNetwork(), refreshNotifications()]);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const go = (n: NotificationRow) => {
    const p = n.payload;
    onNavigate?.();
    if (['friend_request', 'friend_accepted', 'invite_joined'].includes(n.type) && p.from_id) navigate(`/perfil/${p.from_id}`);
    else if (n.type === 'endorsement' && profile) navigate(`/perfil/${profile.id}`);
    else if (n.type === 'message' && p.from_id) navigate(`/chat/${p.from_id}`);
    else if (n.type.startsWith('verification_')) navigate('/ajustes#verificacion');
    else if (p.request_id) navigate(`/pedido/${p.request_id}`);
  };

  if (!loaded && introIds.length) return <RowSkeleton rows={3} />;
  if (list.length === 0) return <p className="text-ink-2 text-center py-6">{t('notifications.empty')}</p>;

  return (
    <ul className="space-y-1">
      {list.map((n) => {
        const p = n.payload;
        const intro = p.intro_id ? intros[p.intro_id] : undefined;
        let key = KNOWN.includes(n.type) ? n.type : 'unknown';
        if (n.type === 'intro_target' && p.via_name) key = p.hop_name ? 'intro_target_hop' : 'intro_target_via';
        if (n.type === 'intro_via' && p.hop_name) key = 'intro_via_hop';
        const values = { ...p, category: p.category ? t(`categories.${p.category}`) : '', note: p.note ?? '' };
        const viaFirst = key === 'intro_target_via' || key === 'intro_target_hop' || n.type === 'intro_via_accepted';
        const actor = (viaFirst ? p.via_name : p.from_name) ?? p.from_name ?? p.via_name ?? p.other_name ?? p.target_name ?? '';
        const actorId = (viaFirst ? p.via_id : p.from_id) ?? p.from_id ?? p.via_id ?? p.other_id ?? p.target_id ?? '';

        let actions: React.ReactNode = null;
        if (n.type === 'friend_request' && p.from_id) {
          const fs = friendState(p.from_id);
          if (fs.state === 'received' && fs.connection) {
            const c = fs.connection;
            actions = (
              <>
                <button className="btn-primary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondFriend(c.id, true))}>
                  {t('network.accept')}
                </button>
                <button className="btn-secondary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondFriend(c.id, false))}>
                  {t('network.decline')}
                </button>
              </>
            );
          } else if (fs.state === 'friends') {
            actions = <span className="text-sm text-ink-2">{t('network.friends_badge')}</span>;
          }
        }
        if (n.type === 'intro_via' && intro) {
          actions =
            intro.status === 'pending' ? (
              <>
                <button className="btn-primary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondIntroVia(intro.id, true))}>
                  {t('notifications.accept')}
                </button>
                <button className="btn-secondary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondIntroVia(intro.id, false))}>
                  {t('notifications.decline')}
                </button>
              </>
            ) : (
              <span className="text-sm text-ink-2">
                {intro.status === 'accepted' ? t('notifications.accepted') : t('notifications.declined')}
              </span>
            );
        }
        if (n.type === 'intro_target' && intro) {
          actions =
            intro.target_status === 'pending' && intro.status === 'accepted' ? (
              <>
                <button className="btn-primary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondIntroTarget(intro.id, true))}>
                  {t('notifications.share_contact')}
                </button>
                <button className="btn-secondary h-8" disabled={busy === n.id} onClick={() => run(n.id, () => api.respondIntroTarget(intro.id, false))}>
                  {t('notifications.no_thanks')}
                </button>
              </>
            ) : intro.target_status === 'accepted' ? (
              <button className="btn-secondary h-8" onClick={() => openWhatsApp(intro.requester_id, p.from_name ?? '')}>
                {t('notifications.open_whatsapp')}
              </button>
            ) : (
              <span className="text-sm text-ink-2">{t('notifications.declined')}</span>
            );
        }
        if (n.type === 'intro_accepted' && p.other_id) {
          const otherId = p.other_id;
          actions = (
            <button className="btn-secondary h-8" onClick={() => openWhatsApp(otherId, p.other_name ?? '')}>
              {t('notifications.open_whatsapp')}
            </button>
          );
        }

        return (
          <li key={n.id} className="rounded-lg p-2 flex gap-3 hover:bg-hover">
            <Avatar id={actorId} name={actor || 'Che'} size={40} />
            <div className="min-w-0 grow">
              <button className="text-left text-[15px] leading-snug w-full" onClick={() => go(n)}>
                <RichText i18nKey={`notifications.types.${key}`} values={values} />
              </button>
              <div className={`text-xs mt-0.5 ${n.read_at ? 'text-ink-2' : 'text-brand font-semibold'}`}>
                {timeAgo(n.created_at, i18n.language)}
              </div>
              {actions && <div className="flex gap-2 mt-2 flex-wrap">{actions}</div>}
            </div>
            {!n.read_at && <span className="h-2 w-2 rounded-full bg-brand mt-2 shrink-0" aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
}
