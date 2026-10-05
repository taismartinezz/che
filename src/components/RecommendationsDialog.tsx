import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Avatar from './Avatar';
import { RowSkeleton } from './States';
import { SoonTag } from './ComingSoonDialog';
import { InviteButtons } from './InviteProgress';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { IntroRequest, Recommendation, RequestRow } from '../lib/types';

const first = (name: string | null | undefined) => (name ?? '').split(' ')[0];

// The path is already shown as the card's label, so these reasons would repeat it.
const PATH_REASONS = ['friend', 'friend_of', 'three_steps'];

export function ReasonChip({ reason }: { reason: string }) {
  const { t } = useTranslation();
  const [key, arg] = reason.split(/:(.*)/s);
  let label: string;
  if (key === 'friend_of') label = t('recs.reasons.friend_of', { name: first(arg) });
  else if (['mutual', 'exchanges', 'endorsements'].includes(key)) label = t(`recs.reasons.${key}`, { count: Number(arg) });
  else label = t(`recs.reasons.${key}`);
  return <span>{label}</span>;
}

/** "Tu amigo/a" · "Amigo/a de Martín" · "Más lejos en tu red" · "Del barrio". */
function PathLabel({ r }: { r: Recommendation }) {
  const { t } = useTranslation();
  let label: string;
  if (r.distance === 1) label = t('recs.label_friend');
  else if (r.distance === 2) label = t('recs.label_friend_of', { name: first(r.via_name) });
  else if (r.distance !== null) label = t('recs.label_far');
  else label = t('recs.from_neighbourhood');
  return (
    <div className="text-sm font-medium text-brand">
      {label}
      {r.distance === 3 && r.bridge_name && r.hop_name && (
        <span className="font-normal text-ink-2"> · {t('recs.via_path', { bridge: first(r.bridge_name), hop: first(r.hop_name) })}</span>
      )}
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
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [intros, setIntros] = useState<IntroRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const howRef = useRef<HTMLParagraphElement>(null);
  const { friends, networkLoading } = useData();
  const isAuthor = request.author_id === me.id;
  const isOpen = request.status === 'open';
  const noNetwork = !networkLoading && friends.length === 0;

  // Without a network, only neighbours who offer this category are worth showing.
  // With a network, people with no path to you are shown only if they're from the same neighbourhood.
  const visible = recs?.filter((r) => (noNetwork ? r.same_neighbourhood : r.distance !== null || r.same_neighbourhood)) ?? null;

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

  const ask = async (r: Recommendation, via: string | null, viaName: string | null, far = false) => {
    setBusy(r.user_id);
    try {
      await api.requestIntro(request.id, r.user_id, via);
      toast(
        far
          ? t('recs.bridge_sent', { name: first(viaName) })
          : viaName
            ? t('recs.intro_sent', { name: first(viaName) })
            : t('recs.contact_requested'),
      );
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const toggleHow = () => {
    setShowHow((s) => !s);
    setTimeout(() => howRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };

  /** The one thing you can do with this person, or null. */
  const primaryAction = (r: Recommendation, intro: IntroRequest | undefined) => {
    const shared = intro && intro.status === 'accepted' && intro.target_status === 'accepted';
    if (r.distance === 1 || shared)
      return (
        <Link className="btn-primary h-8 text-sm" to={`/chat/${r.user_id}`}>
          {t('recs.write')}
        </Link>
      );
    if (!isAuthor || !isOpen) return null;
    if (intro) return 'status';
    if (r.distance === 2 && r.via_id)
      return (
        <button className="btn-primary h-8 text-sm" disabled={busy === r.user_id} onClick={() => ask(r, r.via_id, r.via_name)}>
          {t('recs.ask_intro_via', { name: first(r.via_name) })}
        </button>
      );
    if (r.distance === 3 && r.bridge_id)
      return (
        <button className="btn-primary h-8 text-sm" disabled={busy === r.user_id} onClick={() => ask(r, r.bridge_id, r.bridge_name, true)}>
          {t('recs.ask_bridge', { name: first(r.bridge_name) })}
        </button>
      );
    if (r.distance === null && r.same_neighbourhood)
      return (
        <button className="btn-primary h-8 text-sm" disabled={busy === r.user_id} onClick={() => ask(r, null, null)}>
          {t('recs.ask_contact')}
        </button>
      );
    return null;
  };

  const city = t(`cities.${request.city}`);
  const category = t(`categories.${request.category}`);

  return (
    <Modal open={open} onClose={onClose} title={t('recs.title')} wide>
      <p className="text-sm text-ink-2 mb-3">{t('recs.subtitle', { city, category })}</p>
      {showHow && (
        <p ref={howRef} className="text-xs text-ink-2 bg-field rounded-lg p-3 mb-3">
          {t('recs.how')}
        </p>
      )}
      {!isAuthor && <p className="text-xs text-ink-2 mb-3">{t('recs.only_author')}</p>}

      {noNetwork && (
        <div className="rounded-lg border border-brand/40 p-3 mb-3 space-y-2">
          <p className="font-medium">{t('recs.no_network')}</p>
          <InviteButtons compact />
        </div>
      )}

      {visible === null ? (
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
          {visible.map((r) => {
            const intro = intros.find((i) => i.target_id === r.user_id);
            const action = primaryAction(r, intro);
            const reasons = r.reasons.filter(
              (x) => !PATH_REASONS.includes(x.split(':')[0]) && !(r.distance === null && x === 'same_neighbourhood'),
            );
            return (
              <li key={r.user_id} className="py-3 border-b border-divider last:border-0">
                <div className="flex gap-3">
                  <Avatar id={r.user_id} name={r.display_name} url={r.avatar_url} size={44} link />
                  <div className="grow min-w-0">
                    <Link to={`/perfil/${r.user_id}`} className="font-semibold hover:underline break-words">
                      {r.display_name}
                    </Link>
                    <PathLabel r={r} />
                    <div className="text-sm text-ink-2">
                      {[r.neighbourhood, r.is_verified && t('verify.badge')].filter(Boolean).join(' · ')}
                    </div>
                    {reasons.length > 0 && (
                      <div className="text-sm text-ink-2 flex flex-wrap gap-x-1">
                        {reasons.map((reason, i) => (
                          <span key={reason}>
                            {i > 0 && '· '}
                            <ReasonChip reason={reason} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 pl-[56px]">
                  {action === 'status' && intro ? <IntroStatus intro={intro} /> : action}
                  {/* Never a card with only "Pagar": it only accompanies a real action. */}
                  {action && action !== 'status' && (
                    <button className="btn-secondary h-8 text-sm" onClick={() => showSoon('payments')}>
                      {t('recs.pay')} <SoonTag />
                    </button>
                  )}
                  <button className="ml-auto text-xs text-ink-2 hover:text-brand hover:underline" onClick={toggleHow} aria-expanded={showHow}>
                    {t('recs.score_small', { score: r.score })} · {t('recs.how_title')}
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
