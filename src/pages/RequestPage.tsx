import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Send, UserCheck } from 'lucide-react';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import RequestCard from '../components/RequestCard';
import { IntroStatus } from '../components/RecommendationsDialog';
import { EmptyState, PostSkeleton, RowSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useOpenWhatsApp } from '../hooks/useOpenWhatsApp';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { PROFILE_MINI } from '../lib/constants';
import { REQUEST_COLUMNS, type IntroRequest, type MiniProfile, type RequestRow } from '../lib/types';

interface Exchange {
  helper_id: string;
  thank_you_note: string | null;
}

export default function RequestPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { me } = useMe();
  const { friendState } = useData();
  const { toast, toastError } = useUI();
  const openWhatsApp = useOpenWhatsApp();
  const [request, setRequest] = useState<RequestRow | null | undefined>(undefined);
  const [offerIds, setOfferIds] = useState<string[]>([]);
  const [intros, setIntros] = useState<IntroRequest[]>([]);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [people, setPeople] = useState<Record<string, MiniProfile>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle();
    const req = (data as unknown as RequestRow) ?? null;
    setRequest(req);
    if (!req) return;
    const [{ data: offers }, { data: ints }, { data: ex }] = await Promise.all([
      supabase.from('offers').select('helper_id').eq('request_id', id).order('created_at'),
      supabase.from('intro_requests').select('*').eq('request_id', id).order('created_at'),
      supabase.from('exchanges').select('helper_id, thank_you_note').eq('request_id', id).maybeSingle(),
    ]);
    const oIds = (offers ?? []).map((o) => o.helper_id as string);
    const iRows = (ints ?? []) as IntroRequest[];
    setOfferIds(oIds);
    setIntros(iRows);
    setExchange((ex as Exchange) ?? null);
    const ids = [...new Set([...oIds, ...iRows.flatMap((i) => [i.target_id, i.via_id ?? '']), ex?.helper_id ?? ''].filter(Boolean))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select(PROFILE_MINI).in('id', ids);
      setPeople(Object.fromEntries(((ps ?? []) as MiniProfile[]).map((p) => [p.id, p])));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (request === undefined)
    return (
      <Layout>
        <PostSkeleton />
      </Layout>
    );
  if (request === null)
    return (
      <Layout>
        <EmptyState title={t('request.not_found')} action={<Link to="/" className="btn-primary">{t('nav.back_home')}</Link>} />
      </Layout>
    );

  const isAuthor = request.author_id === me.id;
  const waText = t('request.wa_message', { text: request.text.slice(0, 120) });

  const askContact = async (helperId: string) => {
    setBusy(helperId);
    try {
      await api.requestIntro(request.id, helperId, null);
      toast(t('recs.contact_requested'));
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <RequestCard request={request} iOffered={offerIds.includes(me.id)} onChanged={load} />

      {exchange && people[exchange.helper_id] && (
        <div className="card p-4 flex gap-3 items-center">
          <span className="h-10 w-10 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
            <HeartHandshake size={22} />
          </span>
          <div>
            <div className="font-semibold">{t('request.resolved_by', { name: people[exchange.helper_id].display_name })}</div>
            {exchange.thank_you_note && (
              <div className="text-ink-2 italic">{t('request.resolved_note', { note: exchange.thank_you_note })}</div>
            )}
          </div>
        </div>
      )}

      {isAuthor && (
        <>
          <section className="card p-4">
            <h2 className="text-lg font-bold mb-3">{t('request.offers')}</h2>
            {offerIds.length === 0 ? (
              <p className="text-ink-2">{t('request.no_offers')}</p>
            ) : Object.keys(people).length === 0 ? (
              <RowSkeleton rows={offerIds.length} />
            ) : (
              <ul className="space-y-2">
                {offerIds.map((hid) => {
                  const p = people[hid];
                  if (!p) return null;
                  const intro = intros.find((i) => i.target_id === hid);
                  const isFriend = friendState(hid).state === 'friends';
                  const shared = intro && intro.status === 'accepted' && intro.target_status === 'accepted';
                  return (
                    <li key={hid} className="flex items-center gap-3">
                      <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={44} link />
                      <div className="grow min-w-0">
                        <Link to={`/perfil/${p.id}`} className="font-semibold hover:underline">
                          {p.display_name}
                        </Link>
                        <div className="text-sm text-ink-2">{p.neighbourhood}</div>
                      </div>
                      {isFriend || shared ? (
                        <button className="btn-primary h-8 text-sm" onClick={() => openWhatsApp(hid, p.display_name, waText)}>
                          <Send size={16} /> {t('recs.write')}
                        </button>
                      ) : intro ? (
                        <IntroStatus intro={intro} />
                      ) : request.status === 'open' ? (
                        <button className="btn-soft h-8 text-sm" disabled={busy === hid} onClick={() => askContact(hid)}>
                          <UserCheck size={16} /> {t('request.contact')}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-lg font-bold mb-3">{t('request.intros')}</h2>
            {intros.length === 0 ? (
              <p className="text-ink-2">{t('request.no_intros')}</p>
            ) : (
              <ul className="space-y-3">
                {intros.map((i) => {
                  const target = people[i.target_id];
                  const via = i.via_id ? people[i.via_id] : null;
                  const done = i.status === 'accepted' && i.target_status === 'accepted';
                  return (
                    <li key={i.id} className="flex items-center gap-3">
                      <Avatar id={i.target_id} name={target?.display_name} url={target?.avatar_url} size={44} link />
                      <div className="grow min-w-0">
                        <div className="font-semibold">{t('request.intro_to', { name: target?.display_name ?? '—' })}</div>
                        <div className="text-sm text-ink-2">
                          {[
                            via && t('request.via', { name: via.display_name }),
                            i.status === 'pending' && via
                              ? t('request.waiting_via', { name: via.display_name.split(' ')[0] })
                              : i.status === 'accepted' && i.target_status === 'pending'
                                ? t('request.waiting_target', { name: target?.display_name.split(' ')[0] ?? '' })
                                : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      {done ? (
                        <button className="btn-primary h-8 text-sm" onClick={() => openWhatsApp(i.target_id, target?.display_name ?? '', waText)}>
                          <Send size={16} /> {t('request.open_whatsapp')}
                        </button>
                      ) : (
                        <IntroStatus intro={i} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}
