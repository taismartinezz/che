import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import CategoryChips from '../components/CategoryChips';
import RequestCard from '../components/RequestCard';
import CreateRequestDialog from '../components/CreateRequestDialog';
import { EmptyState, PostSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { PROFILE_MINI, type CategoryId } from '../lib/constants';
import { REQUEST_COLUMNS, type MiniProfile, type RequestRow } from '../lib/types';

export default function Feed() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { viewCity, toastError } = useUI();
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [myOffers, setMyOffers] = useState<Set<string>>(new Set());
  const [recCounts, setRecCounts] = useState<Record<string, number>>({});
  const [people, setPeople] = useState<MiniProfile[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [localQ, setLocalQ] = useState(q);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setLocalQ(q), [q]);

  const load = useCallback(async () => {
    let query = supabase
      .from('requests')
      .select(REQUEST_COLUMNS)
      .eq('city', viewCity)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (category) query = query.eq('category', category);
    if (q) query = query.ilike('text', `%${q.replace(/[%_,()]/g, ' ')}%`);
    const [{ data, error }, { data: offers }] = await Promise.all([
      query,
      supabase.from('offers').select('request_id').eq('helper_id', me.id),
    ]);
    if (error) {
      toastError(error);
      setRequests([]);
      return;
    }
    const rows = (data ?? []) as unknown as RequestRow[];
    setRequests(rows);
    setMyOffers(new Set((offers ?? []).map((o) => o.request_id as string)));
    if (rows.length) {
      const { data: counts } = await supabase.rpc('count_candidates', { p_request_ids: rows.map((r) => r.id) });
      setRecCounts(Object.fromEntries(((counts ?? []) as { request_id: string; n: number }[]).map((c) => [c.request_id, c.n])));
    }
  }, [viewCity, category, q, me.id, toastError]);

  useEffect(() => {
    setRequests(null);
    load();
  }, [load]);

  // People search alongside requests.
  useEffect(() => {
    if (!q) return setPeople([]);
    supabase
      .from('profiles')
      .select(PROFILE_MINI)
      .eq('onboarded', true)
      .ilike('display_name', `%${q.replace(/[%_,()]/g, ' ')}%`)
      .limit(6)
      .then(({ data }) => setPeople((data ?? []) as MiniProfile[]));
  }, [q]);

  // Live updates: new requests in this city and offer counts.
  useEffect(() => {
    const schedule = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 400);
    };
    const channel = supabase
      .channel(`feed:${viewCity}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `city=eq.${viewCity}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, schedule)
      .subscribe();
    return () => {
      clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [viewCity, load]);

  const firstName = me.display_name.split(' ')[0];
  const submitLocal = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(localQ.trim() ? { q: localQ.trim() } : {});
  };

  return (
    <Layout>
      {/* Composer */}
      <div className="card p-3 flex items-center gap-2">
        <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={40} link />
        <button
          className="grow h-10 rounded-full bg-field hover:bg-divider text-left px-4 text-ink-2 text-[15px] truncate"
          onClick={() => setComposerOpen(true)}
        >
          {t('feed.composer', { name: firstName })}
        </button>
      </div>

      {/* Filters + search */}
      <div className="card p-3 space-y-3">
        <form onSubmit={submitLocal} className="relative" role="search">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder={t('feed.search_placeholder')}
            aria-label={t('feed.search_placeholder')}
            className="h-10 w-full rounded-full bg-field pl-9 pr-10 text-[15px] placeholder:text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
          {localQ && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full hover:bg-divider flex items-center justify-center"
              onClick={() => {
                setLocalQ('');
                setParams({});
              }}
              aria-label={t('feed.clear_search')}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <CategoryChips value={category} onChange={setCategory} allowAll scroll />
      </div>

      {q && (
        <div className="px-1 text-ink-2 text-sm font-semibold">{t('feed.searching_for', { q })}</div>
      )}
      {q && people.length > 0 && (
        <div className="card p-3">
          <h3 className="font-semibold mb-2">{t('feed.people')}</h3>
          <ul className="flex gap-3 overflow-x-auto scrollbar-none">
            {people.map((p) => (
              <li key={p.id} className="shrink-0 w-24 text-center">
                <Link to={`/perfil/${p.id}`} className="flex flex-col items-center gap-1 hover:underline">
                  <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={56} />
                  <span className="text-sm font-medium line-clamp-2">{p.display_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {requests === null ? (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      ) : requests.length === 0 ? (
        <EmptyState
          title={q || category ? t('feed.empty_filtered') : t('feed.empty_title')}
          body={q || category ? undefined : t('feed.empty_body', { city: t(`cities.${viewCity}`) })}
          action={
            <button className="btn-primary" onClick={() => setComposerOpen(true)}>
              {t('feed.composer', { name: firstName })}
            </button>
          }
        />
      ) : (
        requests.map((r) => (
          <RequestCard key={r.id} request={r} recCount={recCounts[r.id]} iOffered={myOffers.has(r.id)} onChanged={load} />
        ))
      )}

      <CreateRequestDialog open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={load} />
    </Layout>
  );
}
