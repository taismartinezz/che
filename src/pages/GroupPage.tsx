import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import RequestCard from '../components/RequestCard';
import CreateRequestDialog from '../components/CreateRequestDialog';
import { EmptyState, PostSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { PROFILE_MINI } from '../lib/constants';
import { REQUEST_COLUMNS, type GroupRow, type MiniProfile, type RequestRow } from '../lib/types';
import { GroupMeta } from './Groups';

export default function GroupPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const [group, setGroup] = useState<GroupRow | null | undefined>(undefined);
  const [members, setMembers] = useState<MiniProfile[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [myOffers, setMyOffers] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState(false);

  const load = useCallback(async () => {
    const { data: g } = await supabase.from('groups').select('id, city').eq('id', id).maybeSingle();
    if (!g) return setGroup(null);
    const [{ data: list }, { data: mem }, { data: rq }, { data: offers }] = await Promise.all([
      supabase.rpc('get_groups', { p_city: g.city }),
      supabase.from('group_members').select(`user:profiles!group_members_user_id_fkey(${PROFILE_MINI})`).eq('group_id', id).limit(60),
      supabase.from('requests').select(REQUEST_COLUMNS).eq('group_id', id).eq('status', 'open').order('created_at', { ascending: false }).limit(50),
      supabase.from('offers').select('request_id').eq('helper_id', me.id),
    ]);
    setGroup(((list ?? []) as GroupRow[]).find((x) => x.id === id) ?? null);
    setMembers(((mem ?? []) as unknown as { user: MiniProfile | null }[]).map((m) => m.user).filter(Boolean) as MiniProfile[]);
    setRequests((rq ?? []) as unknown as RequestRow[]);
    setMyOffers(new Set((offers ?? []).map((o) => o.request_id as string)));
  }, [id, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (group === undefined)
    return (
      <Layout>
        <PostSkeleton />
      </Layout>
    );
  if (group === null)
    return (
      <Layout>
        <EmptyState title={t('groups.not_found')} action={<Link to="/grupos" className="btn-primary">{t('groups.title')}</Link>} />
      </Layout>
    );

  const join = async () => {
    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: me.id });
    if (error) return toastError(error);
    toast(t('groups.joined', { name: group.name }));
    load();
  };
  const leave = async () => {
    if (!window.confirm(t('groups.confirm_leave', { name: group.name }))) return;
    const { error } = await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', me.id);
    if (error) return toastError(error);
    load();
  };

  return (
    <Layout>
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to="/grupos" className="text-sm text-ink-2 hover:underline">{t('groups.title')}</Link>
            <h1 className="text-xl font-semibold">{group.name}</h1>
            <GroupMeta g={group} />
            {group.description && <p className="mt-2">{group.description}</p>}
          </div>
          {group.is_member ? (
            <button className="btn-secondary shrink-0" onClick={leave}>{t('groups.leave')}</button>
          ) : (
            <button className="btn-primary shrink-0" onClick={join}>{t('groups.join')}</button>
          )}
        </div>
        {members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1" aria-label={t('groups.members', { count: group.member_count })}>
            {members.slice(0, 12).map((m) => (
              <Link key={m.id} to={`/perfil/${m.id}`} title={m.display_name} className="rounded-full">
                <Avatar id={m.id} name={m.display_name} url={m.avatar_url} size={32} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {group.is_member ? (
        <div className="card p-3 flex items-center gap-2">
          <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={40} />
          <button
            className="grow h-10 rounded-full bg-field hover:bg-divider text-left px-4 text-ink-2 text-[15px] truncate"
            onClick={() => setComposer(true)}
          >
            {t('feed.composer', { name: me.display_name.split(' ')[0] })}
          </button>
        </div>
      ) : (
        <p className="px-1 text-sm text-ink-2">{t('groups.join_to_post')}</p>
      )}

      <h2 className="font-semibold px-1">{t('groups.requests')}</h2>
      {requests.length === 0 ? (
        <div className="card p-4 text-ink-2">{t('groups.no_requests')}</div>
      ) : (
        requests.map((r) => <RequestCard key={r.id} request={r} iOffered={myOffers.has(r.id)} onChanged={load} />)
      )}
      {composer && <CreateRequestDialog open groupId={group.id} onClose={() => setComposer(false)} onCreated={load} />}
    </Layout>
  );
}
