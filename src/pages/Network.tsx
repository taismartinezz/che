import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import Avatar, { initials } from '../components/Avatar';
import PeopleYouMayKnow from '../components/PeopleYouMayKnow';
import InviteLink from '../components/InviteLink';
import { RowSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

interface Node {
  id: string;
  display_name: string;
  avatar_url: string | null;
  ring: 1 | 2;
  via_id: string | null;
  mutual_count: number;
}

const MAX_RING1 = 16;
const MAX_RING2 = 28;

function Graph({ nodes, me }: { nodes: Node[]; me: { id: string; display_name: string; avatar_url: string | null } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ring1 = nodes.filter((n) => n.ring === 1).slice(0, MAX_RING1);
  const ring2 = nodes.filter((n) => n.ring === 2).slice(0, MAX_RING2);
  const size = 520;
  const c = size / 2;
  const r1 = 120;
  const r2 = 215;

  const pos = new Map<string, { x: number; y: number }>();
  ring1.forEach((n, i) => {
    const a = (i / Math.max(ring1.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: c + r1 * Math.cos(a), y: c + r1 * Math.sin(a) });
  });
  // place friends-of-friends near the friend that links them
  const sorted = [...ring2].sort((a, b) => {
    const ia = ring1.findIndex((f) => f.id === a.via_id);
    const ib = ring1.findIndex((f) => f.id === b.via_id);
    return ia - ib;
  });
  sorted.forEach((n, i) => {
    const a = ((i + 0.5) / Math.max(sorted.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: c + r2 * Math.cos(a), y: c + r2 * Math.sin(a) });
  });

  const dot = (id: string, name: string, url: string | null, x: number, y: number, r: number, primary = false) => (
    <g key={id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => navigate(`/perfil/${id}`)}>
      <title>{name}</title>
      <circle r={r + 3} fill="rgb(var(--card))" stroke={primary ? 'rgb(var(--brand))' : 'rgb(var(--divider))'} strokeWidth={primary ? 3 : 2} />
      {url ? (
        <>
          <clipPath id={`clip-${id}`}>
            <circle r={r} />
          </clipPath>
          <image href={url} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#clip-${id})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          <circle r={r} fill={primary ? 'rgb(var(--brand))' : 'rgb(var(--brand-soft))'} />
          <text textAnchor="middle" dy="0.35em" fontSize={r * 0.75} fontWeight={700} fill={primary ? '#fff' : 'rgb(var(--brand))'}>
            {initials(name)}
          </text>
        </>
      )}
    </g>
  );

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[520px] mx-auto" role="img" aria-label={t('network.graph_hint')}>
      <circle cx={c} cy={c} r={r1} fill="none" stroke="rgb(var(--divider))" strokeDasharray="4 6" />
      <circle cx={c} cy={c} r={r2} fill="none" stroke="rgb(var(--divider))" strokeDasharray="4 6" />
      {ring1.map((n) => {
        const p = pos.get(n.id)!;
        return <line key={`l-${n.id}`} x1={c} y1={c} x2={p.x} y2={p.y} stroke="rgb(var(--brand))" strokeOpacity={0.5} strokeWidth={2} />;
      })}
      {sorted.map((n) => {
        const p = pos.get(n.id)!;
        const v = n.via_id ? pos.get(n.via_id) : undefined;
        return v ? <line key={`l-${n.id}`} x1={v.x} y1={v.y} x2={p.x} y2={p.y} stroke="rgb(var(--ink-2))" strokeOpacity={0.35} strokeWidth={1.5} /> : null;
      })}
      {sorted.map((n) => dot(n.id, n.display_name, n.avatar_url, pos.get(n.id)!.x, pos.get(n.id)!.y, 14))}
      {ring1.map((n) => dot(n.id, n.display_name, n.avatar_url, pos.get(n.id)!.x, pos.get(n.id)!.y, 22))}
      {dot(me.id, me.display_name, me.avatar_url, c, c, 34, true)}
    </svg>
  );
}

export default function Network() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { friends, connections, people, refreshNetwork } = useData();
  const { toastError } = useUI();
  const [nodes, setNodes] = useState<Node[] | null>(null);

  useEffect(() => {
    supabase.rpc('get_my_network').then(({ data, error }) => {
      if (error) toastError(error);
      setNodes((data ?? []) as Node[]);
    });
  }, [connections.length, toastError]);

  const counts = useMemo(
    () => ({ f1: nodes?.filter((n) => n.ring === 1).length ?? 0, f2: nodes?.filter((n) => n.ring === 2).length ?? 0 }),
    [nodes],
  );
  const incoming = connections.filter((c) => c.status === 'pending' && c.addressee_id === me.id);
  const outgoing = connections.filter((c) => c.status === 'pending' && c.requester_id === me.id);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Layout variant="full">
      <section className="card p-4">
        <h1 className="text-2xl font-bold">{t('network.title')}</h1>
        <p className="text-ink-2 text-sm mb-3">{t('network.graph_hint')}</p>
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="chip-on cursor-default">{t('network.friends_count', { count: counts.f1 })}</span>
          <span className="chip-off cursor-default">{t('network.fof_count', { count: counts.f2 })}</span>
        </div>
        {nodes === null ? (
          <div className="skeleton aspect-square max-w-[520px] mx-auto rounded-full" />
        ) : (
          <Graph nodes={nodes} me={me} />
        )}
        {nodes && (counts.f1 > MAX_RING1 || counts.f2 > MAX_RING2) && (
          <p className="text-center text-xs text-ink-2">
            {t('network.more', { count: Math.max(0, counts.f1 - MAX_RING1) + Math.max(0, counts.f2 - MAX_RING2) })}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold">{t('network.invite_title')}</h2>
        <p className="text-ink-2 text-sm mb-3">{t('network.invite_body')}</p>
        <InviteLink />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">{t('network.requests')}</h2>
        {incoming.length === 0 ? (
          <p className="text-ink-2">{t('network.no_requests')}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {incoming.map((c) => {
              const p = people[c.requester_id];
              return (
                <li key={c.id} className="flex items-center gap-3">
                  <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={56} link />
                  <div className="grow min-w-0">
                    <Link to={`/perfil/${p.id}`} className="font-semibold hover:underline">{p.display_name}</Link>
                    <div className="flex gap-2 mt-1">
                      <button className="btn-primary h-8" onClick={() => act(() => api.respondFriend(c.id, true))}>{t('network.accept')}</button>
                      <button className="btn-secondary h-8" onClick={() => act(() => api.respondFriend(c.id, false))}>{t('network.decline')}</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {outgoing.length > 0 && (
          <>
            <h3 className="font-semibold mt-4 mb-2 text-ink-2">{t('network.sent_list')}</h3>
            <ul className="space-y-2">
              {outgoing.map((c) => {
                const p = people[c.addressee_id];
                return (
                  <li key={c.id} className="flex items-center gap-3">
                    <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={40} link />
                    <Link to={`/perfil/${p.id}`} className="grow font-medium hover:underline">{p.display_name}</Link>
                    <button className="btn-secondary h-8 text-sm" onClick={() => act(() => api.removeConnection(c.id))}>
                      {t('network.cancel_request')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">{t('network.pymk')}</h2>
        <PeopleYouMayKnow limit={9} big />
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">
          {t('network.friends')} <span className="text-ink-2 font-normal">· {friends.length}</span>
        </h2>
        {nodes === null ? (
          <RowSkeleton rows={3} />
        ) : friends.length === 0 ? (
          <div>
            <p className="font-semibold">{t('network.no_friends')}</p>
            <p className="text-ink-2 text-sm">{t('network.no_friends_hint')}</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {friends.map((f) => {
              const conn = connections.find((c) => c.status === 'accepted' && (c.requester_id === f.id || c.addressee_id === f.id));
              return (
                <li key={f.id} className="flex items-center gap-3 rounded-lg border border-divider p-2">
                  <Avatar id={f.id} name={f.display_name} url={f.avatar_url} size={56} link />
                  <div className="grow min-w-0">
                    <Link to={`/perfil/${f.id}`} className="font-semibold hover:underline block truncate">{f.display_name}</Link>
                    <span className="text-sm text-ink-2">{f.neighbourhood}</span>
                  </div>
                  {conn && (
                    <button
                      className="btn-ghost h-8 text-xs"
                      onClick={() => window.confirm(t('network.confirm_unfriend', { name: f.display_name })) && act(() => api.removeConnection(conn.id))}
                    >
                      {t('network.unfriend')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Layout>
  );
}
