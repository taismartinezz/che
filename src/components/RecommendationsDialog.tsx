import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import { RowSkeleton } from './States';
import { InviteButtons } from './InviteProgress';
import { useData } from '../context/DataContext';
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
  return <span>{label}</span>;
}

export function TrustScore({ score }: { score: number }) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 text-right" title={`${score}/99`}>
      <div className="text-xl font-semibold text-brand tabular-nums leading-none">{score}</div>
      <div className="text-xs text-ink-2">{t('recs.trust')}</div>
    </div>
  );
}

export function IntroStatus({ intro }: { intro: IntroRequest }) {
  const { t } = useTranslation();
  if (intro.status === 'declined' || intro.target_status === 'declined')
    return <span className="text-sm text-ink-2">{t('recs.intro_declined')}</span>;
  if (intro.status === 'accepted' && intro.target_status === 'accepted')
    return <span className="text-sm text-success">{t('recs.intro_done')}</span>;
  if (intro.status === 'accepted') return <span className="text-sm text-ink-2">{t('recs.intro_waiting_target')}</span>;
  return <span className="text-sm text-ink-2">{t('recs.intro_pending')}</span>;
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
  const { friends, networkLoading } = useData();
  const isAuthor = request.author_id === me.id;
  const isOpen = request.status === 'open';
  // Without a network, only neighbours who offer this category are worth showing.
  const noNetwork = !networkLoading && friends.length === 0;
  const visible = recs && (noNetwork ? recs.filter((r) => r.same_neighbourhood) : recs);

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

      {noNetwork && (
        <div className="rounded-lg border border-brand/40 p-3 mb-3 space-y-2">
          <p className="font-medium">{t('recs.no_network')}</p>
          <InviteButtons compact />
        </div>
      )}

      {recs === null || visible === null ? (
        <div className="py-2">
          <p className="text-sm text-ink-2 mb-3">{t('recs.loading')}</p>
          <RowSkeleton rows={4} />
        </div>
      ) : visible.length === 0 ? (
        noNetwork ? null : (
          <div className="text-center py-6 space-y-3">
            <p className="font-semibold">{t('recs.empty')}</p>
            {request.category === 'cuidado' && <p className="text-sm text-ink-2">{t('create.sensitive_note')}</p>}
            <p className="text-sm text-ink-2">{t('recs.empty_hint')}</p>
            <div className="max-w-xs mx-auto">
              <InviteButtons compact />
            </div>
          </div>
        )
      ) : (
        <ul>
          {noNetwork && <li className="text-sm font-semibold text-ink-2 pb-1">{t('recs.from_neighbourhood')}</li>}
          {visible.map((r) => {
            const intro = intros.find((i) => i.target_id === r.user_id);
            const isFriend = r.distance === 1;
            return (
              <li key={r.user_id} className="py-3 border-b border-divider last:border-0">
                <div className="flex gap-3">
                  <Avatar id={r.user_id} name={r.display_name} url={r.avatar_url} size={44} link />
                  <div className="grow min-w-0">
                    <Link to={`/perfil/${r.user_id}`} className="font-semibold hover:underline">
                      {r.display_name}
                    </Link>
                    <div className="text-sm text-ink-2">
                      {r.neighbourhood}
                      {r.is_verified && <span className="text-success"> · {t('verify.badge')}</span>}
                    </div>
                    <div className="text-sm text-ink-2 mt-1 flex flex-wrap gap-x-1">
                      {r.reasons.map((reason, i) => (
                        <span key={reason}>
                          {i > 0 && '· '}
                          <ReasonChip reason={reason} />
                        </span>
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
                      {t('recs.write')}
                    </button>
                  ) : isAuthor && intro ? (
                    intro.status === 'accepted' && intro.target_status === 'accepted' ? (
                      <button
                        className="btn-primary h-8 text-sm"
                        onClick={() =>
                          openWhatsApp(r.user_id, r.display_name, t('request.wa_message', { text: request.text.slice(0, 120) }))
                        }
                      >
                        {t('recs.write')}
                      </button>
                    ) : (
                      <IntroStatus intro={intro} />
                    )
                  ) : isAuthor && isOpen ? (
                    <button className="btn-primary h-8 text-sm" disabled={busy === r.user_id} onClick={() => ask(r)}>
                      {r.via_name ? t('recs.ask_intro_via', { name: r.via_name.split(' ')[0] }) : t('recs.ask_contact')}
                    </button>
                  ) : null}
                  {(isFriend || (intro && intro.status === 'accepted' && intro.target_status === 'accepted')) && (
                    <Link className="btn-secondary h-8 text-sm" to={`/chat/${r.user_id}`}>
                      {t('recs.chat')}
                    </Link>
                  )}
                  <button className="btn-ghost h-8 text-sm" onClick={() => showSoon('payments')}>
                    {t('recs.pay')}
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
