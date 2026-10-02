import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Award, BadgeCheck, Ban, Briefcase, Check, Flag, HeartHandshake, MapPin, Pencil, Send, UserPlus, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import Menu, { type MenuItem } from '../components/Menu';
import { CategoryTag } from '../components/CategoryChips';
import RequestCard from '../components/RequestCard';
import EndorseDialog from '../components/EndorseDialog';
import ReportDialog from '../components/ReportDialog';
import { SoonTag } from '../components/ComingSoonDialog';
import { EmptyState, PostSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useOpenWhatsApp } from '../hooks/useOpenWhatsApp';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { PROFILE_COLUMNS, PROFILE_MINI } from '../lib/constants';
import { REQUEST_COLUMNS, type MiniProfile, type Profile as ProfileT, type RequestRow } from '../lib/types';

interface Endorsement {
  id: string;
  category: string;
  note: string | null;
  from: MiniProfile | null;
}
interface Thanks {
  id: string;
  thank_you_note: string | null;
  completed_at: string;
  requester: MiniProfile | null;
}

export default function Profile() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const { friendState, refreshNetwork } = useData();
  const { showSoon, toast, toastError } = useUI();
  const openWhatsApp = useOpenWhatsApp();
  const [person, setPerson] = useState<ProfileT | null | undefined>(undefined);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [thanks, setThanks] = useState<Thanks[]>([]);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [myOffers, setMyOffers] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'endorse' | 'report'>(null);

  const isMe = id === me.id;

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
    setPerson((data as ProfileT) ?? null);
    if (!data) return;
    const [{ data: en }, { data: ex, count }, { data: rq }, { data: offers }] = await Promise.all([
      supabase
        .from('endorsements')
        .select(`id, category, note, from:profiles!endorsements_from_id_fkey(${PROFILE_MINI})`)
        .eq('to_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('exchanges')
        .select(`id, thank_you_note, completed_at, requester:profiles!exchanges_requester_id_fkey(${PROFILE_MINI})`, { count: 'exact' })
        .eq('helper_id', id)
        .order('completed_at', { ascending: false })
        .limit(20),
      supabase.from('requests').select(REQUEST_COLUMNS).eq('author_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('offers').select('request_id').eq('helper_id', me.id),
    ]);
    setEndorsements((en ?? []) as unknown as Endorsement[]);
    setThanks((ex ?? []) as unknown as Thanks[]);
    setExchangeCount(count ?? 0);
    setRequests((rq ?? []) as unknown as RequestRow[]);
    setMyOffers(new Set((offers ?? []).map((o) => o.request_id as string)));
  }, [id, me.id]);

  useEffect(() => {
    setPerson(undefined);
    load();
  }, [load]);

  if (person === undefined)
    return (
      <Layout variant="full">
        <PostSkeleton />
      </Layout>
    );
  if (person === null)
    return (
      <Layout variant="full">
        <EmptyState title={t('profile.not_found')} action={<Link to="/" className="btn-primary">{t('nav.back_home')}</Link>} />
      </Layout>
    );

  const fs = friendState(person.id);
  const first = person.display_name.split(' ')[0];
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  const menu: MenuItem[] = isMe
    ? []
    : [
        { label: t('safety.report_profile'), icon: <Flag size={18} />, onClick: () => setDialog('report') },
        {
          label: `${t('safety.block')} ${first}`,
          icon: <Ban size={18} />,
          danger: true,
          onClick: async () => {
            if (!window.confirm(t('safety.confirm_block', { name: person.display_name }))) return;
            try {
              await api.block(person.id);
              toast(t('safety.blocked', { name: person.display_name }));
              await refreshNetwork();
              setPerson(null);
            } catch (e) {
              toastError(e);
            }
          },
        },
      ];

  const endorsementsBy = (cat: string) => endorsements.filter((e) => e.category === cat).length;
  const since = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es-UY', { month: 'long', year: 'numeric' }).format(
    new Date(person.created_at),
  );

  return (
    <Layout variant="full">
      <section className="card overflow-hidden">
        <div className="h-32 sm:h-48 bg-gradient-to-br from-brand to-brand-hover" />
        <div className="px-4 pb-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="-mt-16 sm:-mt-20 shrink-0">
            <Avatar id={person.id} name={person.display_name} url={person.avatar_url} size={136} ring />
          </div>
          <div className="grow sm:pt-3">
            <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight">{person.display_name}</h1>
            <div className="text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {person.neighbourhood && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={16} /> {person.neighbourhood}, {person.city ? t(`cities.${person.city}`) : ''}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <HeartHandshake size={16} /> {t('profile.exchanges', { count: exchangeCount })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button className="tag bg-field text-ink-2 gap-1 py-1" onClick={() => showSoon('verification')}>
                <BadgeCheck size={14} /> {t('profile.verified_badge')} <SoonTag />
              </button>
              <button className="tag bg-field text-ink-2 gap-1 py-1" onClick={() => showSoon('registered_worker')}>
                <Briefcase size={14} /> {t('profile.worker_badge')} <SoonTag />
              </button>
            </div>
          </div>
          <div className="flex gap-2 sm:pt-4 flex-wrap">
            {isMe ? (
              <Link to="/ajustes" className="btn-secondary">
                <Pencil size={18} /> {t('profile.edit')}
              </Link>
            ) : (
              <>
                {fs.state === 'friends' && (
                  <>
                    <button className="btn-primary" onClick={() => openWhatsApp(person.id, person.display_name)}>
                      <Send size={18} /> {t('profile.write')}
                    </button>
                    <button className="btn-secondary" onClick={() => setDialog('endorse')}>
                      <Award size={18} /> {t('profile.endorse')}
                    </button>
                    <span className="btn-secondary cursor-default">
                      <Check size={18} /> {t('network.friends_badge')}
                    </span>
                  </>
                )}
                {fs.state === 'none' && (
                  <button className="btn-primary" onClick={() => act(() => api.sendFriendRequest(person.id))}>
                    <UserPlus size={18} /> {t('profile.add_friend')}
                  </button>
                )}
                {fs.state === 'sent' && fs.connection && (
                  <button className="btn-secondary" onClick={() => act(() => api.removeConnection(fs.connection!.id))}>
                    <Clock size={18} /> {t('network.cancel_request')}
                  </button>
                )}
                {fs.state === 'received' && fs.connection && (
                  <>
                    <button className="btn-primary" onClick={() => act(() => api.respondFriend(fs.connection!.id, true))}>
                      {t('network.accept')}
                    </button>
                    <button className="btn-secondary" onClick={() => act(() => api.respondFriend(fs.connection!.id, false))}>
                      {t('network.decline')}
                    </button>
                  </>
                )}
                <Menu items={menu} />
              </>
            )}
          </div>
        </div>
        {person.bio && <p className="px-4 pb-4 text-[15px] whitespace-pre-wrap">{person.bio}</p>}
        <p className="px-4 pb-4 text-xs text-ink-2">{t('profile.member_since', { date: since })}</p>
      </section>

      <div className="grid wide:grid-cols-[2fr_3fr] gap-3 sm:gap-4 items-start">
        <div className="space-y-3 sm:space-y-4">
          <section className="card p-4">
            <h2 className="text-lg font-bold mb-3">{t('profile.skills')}</h2>
            {person.skills.length === 0 ? (
              <p className="text-ink-2">{t('profile.no_skills')}</p>
            ) : (
              <ul className="space-y-2">
                {person.skills.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2">
                    <CategoryTag id={s} />
                    {endorsementsBy(s) > 0 && (
                      <span className="text-sm text-ink-2 inline-flex items-center gap-1">
                        <Award size={14} /> {t('recs.reasons.endorsements', { count: endorsementsBy(s) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-lg font-bold mb-3">{t('profile.endorsements')}</h2>
            {endorsements.length === 0 ? (
              <p className="text-ink-2">{t('profile.no_endorsements')}</p>
            ) : (
              <ul className="space-y-3">
                {endorsements.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <Avatar id={e.from?.id} name={e.from?.display_name} url={e.from?.avatar_url} size={36} link />
                    <div className="text-sm">
                      <div>
                        <Link to={`/perfil/${e.from?.id}`} className="font-semibold hover:underline">{e.from?.display_name}</Link>{' '}
                        <span className="text-ink-2">· {t(`categories.${e.category}`)}</span>
                      </div>
                      {e.note && <p className="text-ink-2">"{e.note}"</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-lg font-bold mb-3">{t('profile.thanks')}</h2>
            {thanks.filter((x) => x.thank_you_note).length === 0 ? (
              <p className="text-ink-2">{t('profile.no_thanks')}</p>
            ) : (
              <ul className="space-y-3">
                {thanks
                  .filter((x) => x.thank_you_note)
                  .map((x) => (
                    <li key={x.id} className="flex gap-2">
                      <Avatar id={x.requester?.id} name={x.requester?.display_name} url={x.requester?.avatar_url} size={36} link />
                      <div className="text-sm">
                        <Link to={`/perfil/${x.requester?.id}`} className="font-semibold hover:underline">{x.requester?.display_name}</Link>
                        <p className="text-ink-2">"{x.thank_you_note}"</p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg font-bold px-1">{t('profile.requests')}</h2>
          {requests.length === 0 ? (
            <div className="card p-4 text-ink-2">{t('profile.no_requests')}</div>
          ) : (
            requests.map((r) => <RequestCard key={r.id} request={r} iOffered={myOffers.has(r.id)} onChanged={load} />)
          )}
        </div>
      </div>

      {dialog === 'endorse' && <EndorseDialog person={person} open onClose={() => setDialog(null)} onDone={load} />}
      {dialog === 'report' && <ReportDialog targetType="profile" targetId={person.id} open onClose={() => setDialog(null)} />}
    </Layout>
  );
}
