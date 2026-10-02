import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import Avatar from './Avatar';
import { RowSkeleton } from './States';

interface Person {
  id: string;
  display_name: string;
  avatar_url: string | null;
  neighbourhood: string | null;
  mutual_count: number;
}

export default function PeopleYouMayKnow({ limit = 5, big = false }: { limit?: number; big?: boolean }) {
  const { t } = useTranslation();
  const { connections, refreshNetwork, friendState } = useData();
  const { toastError } = useUI();
  const [people, setPeople] = useState<Person[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_people_you_may_know', { p_limit: limit });
    setPeople((data ?? []) as Person[]);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load, connections.length]);

  const add = async (id: string) => {
    try {
      await api.sendFriendRequest(id);
      await refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  if (people === null) return <RowSkeleton rows={2} />;
  if (people.length === 0) return big ? <p className="text-ink-2 text-sm">{t('network.no_friends_hint')}</p> : null;

  return (
    <ul className={big ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : 'space-y-1'}>
      {people.map((p) => {
        const state = friendState(p.id).state;
        const button =
          state === 'sent' ? (
            <span className="btn-secondary h-8 text-sm">{t('network.sent')}</span>
          ) : (
            <button className="btn-soft h-8 text-sm" onClick={() => add(p.id)}>
              <UserPlus size={16} /> {t('network.add')}
            </button>
          );
        return big ? (
          <li key={p.id} className="card border border-divider overflow-hidden flex flex-col">
            <Link to={`/perfil/${p.id}`} className="flex justify-center bg-brand-soft py-4">
              <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={72} />
            </Link>
            <div className="p-3 flex flex-col gap-1 grow">
              <Link to={`/perfil/${p.id}`} className="font-semibold hover:underline truncate">
                {p.display_name}
              </Link>
              <span className="text-xs text-ink-2">{t('network.mutual', { count: p.mutual_count })}</span>
              <div className="mt-auto pt-2">{button}</div>
            </div>
          </li>
        ) : (
          <li key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover">
            <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={40} link />
            <div className="min-w-0 grow">
              <Link to={`/perfil/${p.id}`} className="block font-semibold text-[15px] truncate hover:underline">
                {p.display_name}
              </Link>
              <span className="text-xs text-ink-2">{t('network.mutual', { count: p.mutual_count })}</span>
            </div>
            {state === 'sent' ? (
              <span className="text-xs text-ink-2">{t('network.sent')}</span>
            ) : (
              <button className="icon-btn h-8 w-8 bg-brand-soft text-brand" onClick={() => add(p.id)} aria-label={t('network.add')}>
                <UserPlus size={16} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
