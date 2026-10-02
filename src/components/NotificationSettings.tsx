import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from './TopBar';
import { useAuth, useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { disablePush, enablePush, isPushOn, pushConfigured, pushSupported } from '../lib/push';

export default function NotificationSettings() {
  const { t } = useTranslation();
  const { me, priv } = useMe();
  const { refreshProfile } = useAuth();
  const { toast, toastError } = useUI();
  const [email, setEmail] = useState(priv.email_notifications);
  const [push, setPush] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isPushOn().then(setPush).catch(() => setPush(false));
    if (!pushSupported()) setNote(t('notif_settings.push_unsupported'));
    else if (!pushConfigured) setNote(t('notif_settings.push_unconfigured'));
    else if (Notification.permission === 'denied') setNote(t('notif_settings.push_blocked'));
  }, [t]);

  const toggleEmail = async () => {
    const next = !email;
    setEmail(next);
    const { error } = await supabase.from('profiles').update({ email_notifications: next }).eq('id', me.id);
    if (error) {
      setEmail(!next);
      return toastError(error);
    }
    refreshProfile();
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (push) {
        await disablePush();
        setPush(false);
      } else {
        const res = await enablePush(me.id);
        if (res === 'blocked') setNote(t('notif_settings.push_blocked'));
        else {
          setPush(true);
          setNote(null);
          await supabase.from('profiles').update({ push_notifications: true }).eq('id', me.id);
          toast(t('notif_settings.push_on'));
        }
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const pushAvailable = pushSupported() && pushConfigured;

  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-semibold">{t('notif_settings.title')}</h2>
      <button className="flex items-start justify-between gap-4 w-full text-left" onClick={toggleEmail} aria-pressed={email}>
        <span>
          <span className="block">{t('notif_settings.email')}</span>
          <span className="block text-sm text-ink-2">{t('notif_settings.email_hint')}</span>
        </span>
        <Switch on={email} />
      </button>
      <button
        className="flex items-start justify-between gap-4 w-full text-left disabled:opacity-60"
        onClick={togglePush}
        disabled={!pushAvailable || busy}
        aria-pressed={push}
      >
        <span>
          <span className="block">{t('notif_settings.push')}</span>
          <span className="block text-sm text-ink-2">{note ?? t('notif_settings.push_hint')}</span>
        </span>
        <Switch on={push} />
      </button>
    </section>
  );
}
