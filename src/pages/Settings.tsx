import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import ProfileForm from '../components/ProfileForm';
import Avatar from '../components/Avatar';
import InviteLink from '../components/InviteLink';
import { Switch } from '../components/TopBar';
import { useAuth, useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { PROFILE_MINI } from '../lib/constants';
import type { MiniProfile } from '../lib/types';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { me, priv } = useMe();
  const { refreshProfile, signOut } = useAuth();
  const { refreshNetwork } = useData();
  const { dark, toggleDark, toast, toastError } = useUI();
  const [blocked, setBlocked] = useState<MiniProfile[]>([]);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadBlocked = useCallback(async () => {
    const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', me.id);
    const ids = (data ?? []).map((b) => b.blocked_id as string);
    if (!ids.length) return setBlocked([]);
    // Blocked profiles are hidden by RLS, so show what we can (name may be missing).
    const { data: ps } = await supabase.from('profiles').select(PROFILE_MINI).in('id', ids);
    setBlocked(ids.map((id) => (ps ?? []).find((p) => p.id === id) ?? { id, display_name: '—', avatar_url: null, neighbourhood: null }) as MiniProfile[]);
  }, [me.id]);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  const unblock = async (p: MiniProfile) => {
    try {
      await api.unblock(me.id, p.id);
      toast(t('safety.unblocked', { name: p.display_name }));
      loadBlocked();
      refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(me.id);
      toast(t('settings.deleted'));
      await signOut();
    } catch (e) {
      toastError(e);
      setDeleting(false);
    }
  };

  return (
    <Layout variant="full">
      <div className="max-w-[680px] mx-auto space-y-3 sm:space-y-4">
        <h1 className="text-2xl font-bold px-1">{t('settings.title')}</h1>

        <section className="card p-4">
          <h2 className="text-lg font-bold mb-4">{t('settings.profile')}</h2>
          <ProfileForm
            profile={me}
            whatsapp={priv.contact_whatsapp}
            submitLabel={t('settings.save')}
            onSaved={() => {
              toast(t('settings.saved'));
              refreshProfile();
            }}
          />
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="text-lg font-bold mb-2">{t('settings.preferences')}</h2>
          <div className="flex items-center justify-between">
            <span>{t('settings.language')}</span>
            <div className="flex rounded-lg bg-field p-1">
              {(['es', 'en'] as const).map((l) => (
                <button
                  key={l}
                  className={`px-4 h-8 rounded-md text-sm font-semibold ${i18n.language === l ? 'bg-card shadow-card text-brand' : 'text-ink-2'}`}
                  onClick={() => i18n.changeLanguage(l)}
                  aria-pressed={i18n.language === l}
                >
                  {l === 'es' ? 'Español' : 'English'}
                </button>
              ))}
            </div>
          </div>
          <button className="flex items-center justify-between w-full py-2" onClick={toggleDark} aria-pressed={dark}>
            <span>{t('settings.dark_mode')}</span>
            <Switch on={dark} />
          </button>
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-bold mb-3">{t('settings.invite')}</h2>
          <InviteLink />
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-bold mb-3">{t('settings.blocked')}</h2>
          {blocked.length === 0 ? (
            <p className="text-ink-2">{t('settings.no_blocked')}</p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Avatar id={p.id} name={p.display_name} url={p.avatar_url} size={36} />
                  <span className="grow">{p.display_name}</span>
                  <button className="btn-secondary h-8 text-sm" onClick={() => unblock(p)}>
                    {t('safety.unblock')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4 border border-danger/40">
          <h2 className="text-lg font-bold text-danger mb-1">{t('settings.danger')}</h2>
          <p className="text-sm text-ink-2 mb-3">{t('settings.delete_body')}</p>
          <label className="label" htmlFor="del-confirm">{t('settings.delete_confirm')}</label>
          <input id="del-confirm" className="input mb-3" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <button className="btn-danger w-full" disabled={confirm.trim().toUpperCase() !== t('settings.delete_word') || deleting} onClick={deleteAccount}>
            {t('settings.delete_button')}
          </button>
        </section>
      </div>
    </Layout>
  );
}
