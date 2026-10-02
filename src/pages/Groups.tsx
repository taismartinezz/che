import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { RowSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { neighbourhoodsFor } from '../lib/constants';
import type { GroupRow } from '../lib/types';

export function GroupMeta({ g }: { g: GroupRow }) {
  const { t } = useTranslation();
  return (
    <span className="text-sm text-ink-2">
      {[g.neighbourhood, t('groups.members', { count: g.member_count }), g.friends_in_group > 0 && t('groups.friends', { count: g.friends_in_group })]
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

function CreateGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toastError } = useUI();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [nb, setNb] = useState(me.neighbourhood ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { p_name: name, p_neighbourhood: nb, p_description: description });
    setBusy(false);
    if (error) return toastError(error);
    onClose();
    navigate(`/grupos/${data}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('groups.create')}
      footer={
        <button className="btn-primary w-full" disabled={busy || name.trim().length < 3} onClick={create}>
          {t('groups.create')}
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="g-name">{t('groups.name')}</label>
          <input id="g-name" className="input" maxLength={80} value={name} placeholder={t('groups.name_placeholder')} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="g-nb">{t('groups.neighbourhood')}</label>
          <select id="g-nb" className="input" value={nb} onChange={(e) => setNb(e.target.value)}>
            {neighbourhoodsFor(me.city).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="g-desc">{t('groups.description')}</label>
          <textarea id="g-desc" className="input min-h-[70px]" maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function Groups() {
  const { t } = useTranslation();
  const { viewCity, toast, toastError } = useUI();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const { me } = useMe();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_groups', { p_city: viewCity });
    if (error) toastError(error);
    setGroups((data ?? []) as GroupRow[]);
  }, [viewCity, toastError]);

  useEffect(() => {
    setGroups(null);
    load();
  }, [load]);

  const join = async (g: GroupRow) => {
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: me.id });
    if (error) return toastError(error);
    toast(t('groups.joined', { name: g.name }));
    load();
  };

  const city = t(`cities.${viewCity}`);
  const mine = groups?.filter((g) => g.is_member) ?? [];
  const others = groups?.filter((g) => !g.is_member) ?? [];

  return (
    <Layout>
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t('groups.title')}</h1>
            <p className="text-sm text-ink-2 mt-1">{t('groups.subtitle', { city })}</p>
          </div>
          {me.city === viewCity && (
            <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>
              {t('groups.create')}
            </button>
          )}
        </div>
      </section>

      {groups === null ? (
        <div className="card p-4"><RowSkeleton rows={3} /></div>
      ) : (
        <>
          {mine.length > 0 && (
            <section className="card p-4">
              <h2 className="font-semibold mb-2">{t('groups.mine')}</h2>
              <ul className="divide-y divide-divider">
                {mine.map((g) => (
                  <li key={g.id} className="py-2">
                    <Link to={`/grupos/${g.id}`} className="font-medium hover:underline">{g.name}</Link>
                    <div><GroupMeta g={g} /></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card p-4">
            <h2 className="font-semibold mb-2">{t('groups.discover', { city })}</h2>
            {others.length === 0 && mine.length === 0 ? (
              <p className="text-ink-2">{t('groups.none', { city })}</p>
            ) : (
              <ul className="divide-y divide-divider">
                {others.map((g) => (
                  <li key={g.id} className="py-2 flex items-center gap-3">
                    <div className="grow min-w-0">
                      <Link to={`/grupos/${g.id}`} className="font-medium hover:underline">{g.name}</Link>
                      <div><GroupMeta g={g} /></div>
                      {g.description && <p className="text-sm mt-0.5 line-clamp-2">{g.description}</p>}
                    </div>
                    <button className="btn-secondary h-8 text-sm shrink-0" onClick={() => join(g)}>
                      {t('groups.join')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {creating && <CreateGroupDialog open onClose={() => setCreating(false)} />}
    </Layout>
  );
}
