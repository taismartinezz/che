import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api } from '../lib/api';
import Avatar from './Avatar';
import PeopleYouMayKnow from './PeopleYouMayKnow';
import { RowSkeleton } from './States';
import InviteLink from './InviteLink';

export default function RightSidebar() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { friends, connections, people, networkLoading, refreshNetwork } = useData();
  const { toastError } = useUI();
  const incoming = connections.filter((c) => c.status === 'pending' && c.addressee_id === me.id);

  const respond = async (id: string, accept: boolean) => {
    try {
      await api.respondFriend(id, accept);
      await refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="px-2 space-y-4">
      {incoming.length > 0 && (
        <section>
          <h3 className="px-2 text-[17px] font-semibold text-ink-2 mb-1">{t('network.requests')}</h3>
          {incoming.map((c) => {
            const p = people[c.requester_id];
            if (!p) return null;
            return (
              <div key={c.id} className="flex gap-3 p-2 rounded-lg hover:bg-hover">
                <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={48} link />
                <div className="grow min-w-0">
                  <Link to={`/perfil/${p.id}`} className="font-semibold hover:underline block truncate">
                    {p.display_name}
                  </Link>
                  <div className="flex gap-2 mt-1">
                    <button className="btn-primary h-8 grow" onClick={() => respond(c.id, true)}>
                      {t('network.accept')}
                    </button>
                    <button className="btn-secondary h-8 grow" onClick={() => respond(c.id, false)}>
                      {t('network.decline')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <hr className="border-divider mt-3 mx-2" />
        </section>
      )}

      <section>
        <h3 className="px-2 text-[17px] font-semibold text-ink-2 mb-1">{t('network.pymk')}</h3>
        <PeopleYouMayKnow limit={4} />
      </section>
      <hr className="border-divider mx-2" />

      <section>
        <div className="flex items-center justify-between px-2 mb-1">
          <h3 className="text-[17px] font-semibold text-ink-2">{t('network.your_network')}</h3>
          <Link to="/red" className="text-sm text-brand hover:underline">
            {t('network.friends_count', { count: friends.length })}
          </Link>
        </div>
        {networkLoading ? (
          <RowSkeleton rows={4} />
        ) : friends.length === 0 ? (
          <div className="px-2 space-y-2">
            <p className="text-sm text-ink-2">{t('network.no_friends_hint')}</p>
            <InviteLink compact />
          </div>
        ) : (
          <ul>
            {friends.map((f) => (
              <li key={f.id}>
                <Link to={`/perfil/${f.id}`} className="side-link">
                  <Avatar id={f.id} name={f.display_name} url={f.avatar_url} size={36} />
                  <span className="truncate">{f.display_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
