import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, Info, MessageCircle, Send, UserCheck } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import { RowSkeleton } from './States';
import InviteLink from './InviteLink';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useOpenWhatsApp } from '../hooks/useOpenWhatsApp';
import type { IntroRequest, Recommendation, RequestRow } from '../lib/types';

export function ReasonChip({ reason }: { reason: string }) {
  const { t } = useTranslation();
  const [key, arg] = reason.split(/:(.*)/s);
  let label: string;
  if (key === 'friend_of') label = t('recs.reasons.friend_of', { name: arg.split(' ')[0] });
  else if (['mutual', 'exchanges', 'endorsements'].includes(key)) label = t(`recs.reasons.${key}`, { count: Number(arg) });
  else label = t(`recs.reasons.${key}`);
  return <span className="tag bg-field text-ink font-medium px-2 py-1 rounded-full">{label}</span>;
}

export function TrustScore({ score }: { score: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center shrink-0 w-16" title={`${score}/99`}>
      <div
        className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-extrabold text-brand"
        style={{ background: `conic-gradient(rgb(var(--brand)) ${(score / 99) * 360}deg, rgb(var(--brand-soft)) 0deg)` }}
      >
        <span className="h-9 w-9 rounded-full bg-card flex items-center justify-center">{score}</span>
      </div>
      <span className="text-[11px] text-ink-2 mt-0.5">{t('recs.trust')}</span>
    </div>
  );
}

export function IntroStatus({ intro }: { intro: IntroRequest }) {
  const { t } = useTranslation();
  if (intro.status === 'declined' || intro.target_status === 'declined')
    return <span className="tag bg-field text-ink-2">{t('recs.intro_declined')}</span>;
  if (intro.status === 'accepted' && intro.target_status === 'accepted')
    return <span className="tag-ok">{t('recs.intro_done')}</span>;
  if (intro.status === 'accepted') return <span className="tag bg-brand-soft text-brand">{t('recs.intro_waiting_target')}</span>;
  return <span className="tag bg-brand-soft text-brand">{t('recs.intro_pending')}</span>;
}

export default function RecommendationsDialog({ request, open, onClose }: { request: RequestRow; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { showSoon, toast, toastError } = useUI();
  const openWhatsApp = useOpenWhatsApp();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [intros, setIntros] = useState<IntroRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const isAuthor = request.author_id === me.id;
  const isOpen = request.status === 'open';

  const load = useCallback(async () => {
    const [{ data, error }, { data: ints }] = await Promise.all([
      supabase.rpc('get_recommendations', { p_request_id: request.id }),
      isAuthor
        ? supabase.from('intro_requests').select('*').eq('request_id', request.id)
        : Promise.resolve({ data: [] as IntroRequest[] }),
    ]);
    if (error) {
      toastError(error);
      setRecs([]);
      return;
    }
    setRecs((data ?? []) as Recommendation[]);
    setIntros((ints ?? []) as IntroRequest[]);
  }, [request.id, isAuthor, toastError]);

  useEffect(() => {
    if (open) {
      setRecs(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request.id]);

  const ask = async (r: Recommendation) => {
    setBusy(r.user_id);
    try {
      await api.requestIntro(request.id, r.user_id, r.via_id);
      toast(r.via_name ? t('recs.intro_sent', { name: r.via_name.split(' ')[0] }) : t('recs.contact_requested'));
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const city = t(`cities.${request.city}`);
  const category = t(`categories.${request.category}`);

  return (
    <Modal open={open} onClose={onClose} title={t('recs.title')} wide>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm text-ink-2">{t('recs.subtitle', { city, category })}</p>
        <button className="btn-ghost h-8 px-2 text-sm shrink-0" onClick={() => setShowHow((s) => !s)} aria-expanded={showHow}>
          <Info size={16} /> {t('recs.how_title')}
        </button>
      </div>
      {showHow && <p className="text-xs text-ink-2 bg-field rounded-lg p-3 mb-3">{t('recs.how')}</p>}
      {isAuthor === false && <p className="text-xs text-ink-2 mb-3">{t('recs.only_author')}</p>}

      {recs === null ? (
        <div className="py-2">
          <p className="text-sm text-ink-2 mb-3">{t('recs.loading')}</p>
          <RowSkeleton rows={4} />
        </div>
      ) : recs.length === 0 ? (
        <div className="text-center py-6 space-y-3">
          <p className="font-semibold">{t('recs.empty')}</p>
          <p className="text-sm text-ink-2">{t('recs.empty_hint')}</p>
          <div className="max-w-xs mx-auto">
            <InviteLink compact />
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {recs.map((r) => {
            const intro = intros.find((i) => i.target_id === r.user_id);
            const isFriend = r.distance === 1;
            return (
              <li key={r.user_id} className="card border border-divider p-3">
                <div className="flex gap-3">
                  <Avatar id={r.user_id} name={r.display_name} url={r.avatar_url} size={52} link />
                  <div className="grow min-w-0">
                    <Link to={`/perfil/${r.user_id}`} className="font-semibold hover:underline">
                      {r.display_name}
                    </Link>
                    <div className="text-sm text-ink-2">{r.neighbourhood}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.reasons.map((reason) => (
                        <ReasonChip key={reason} reason={reason} />
                      ))}
                    </div>
                  </div>
                  <TrustScore score={r.score} />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {isFriend ? (
                    <button
                      className="btn-primary h-8 text-sm"
                      onClick={() =>
                        openWhatsApp(r.user_id, r.display_name, t('request.wa_message', { text: request.text.slice(0, 120) }))
                      }
                    >
                      <Send size={16} /> {t('recs.write')}
                    </button>
                  ) : isAuthor && intro ? (
                    intro.status === 'accepted' && intro.target_status === 'accepted' ? (
                      <button
                        className="btn-primary h-8 text-sm"
                        onClick={() =>
                          openWhatsApp(r.user_id, r.display_name, t('request.wa_message', { text: request.text.slice(0, 120) }))
                        }
                      >
                        <Send size={16} /> {t('recs.write')}
                      </button>
                    ) : (
                      <IntroStatus intro={intro} />
                    )
                  ) : isAuthor && isOpen ? (
                    <button className="btn-primary h-8 text-sm" disabled={busy === r.user_id} onClick={() => ask(r)}>
                      <UserCheck size={16} />
                      {r.via_name ? t('recs.ask_intro_via', { name: r.via_name.split(' ')[0] }) : t('recs.ask_contact')}
                    </button>
                  ) : null}
                  <button className="btn-secondary h-8 text-sm" onClick={() => showSoon('chat')}>
                    <MessageCircle size={16} /> {t('recs.chat')} <span className="tag-soon">{t('soon.tag')}</span>
                  </button>
                  <button className="btn-secondary h-8 text-sm" onClick={() => showSoon('payments')}>
                    <CreditCard size={16} /> {t('recs.pay')} <span className="tag-soon">{t('soon.tag')}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
