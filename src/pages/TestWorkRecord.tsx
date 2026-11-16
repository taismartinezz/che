import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMe } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import TestAgreements from '../components/TestAgreements';
import Layout from '../components/Layout';

export function TestWorkRecord() {
  const { me } = useMe();
  return <Layout variant="full"><TestAgreements me={me.id} /></Layout>;
}
interface SharedRecord {
  task: string; scheduled_at: string; amount_minor: number; currency: string;
  receipt: string; review: string | null;
}
export function SharedTestRecord() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState<{ token?: string; status: 'loading' | 'ready' | 'error'; data: SharedRecord | null }>({ status: 'loading', data: null });
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = async () => {
      const request = ++latest;
      if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        setResult({ token, status: 'ready', data: null });
        return;
      }
      try {
        const { data, error } = await supabase.rpc('shared_test_record', { p_token: token });
        if (active && request === latest) setResult({ token, status: error ? 'error' : 'ready', data: error ? null : data as SharedRecord | null });
      } catch {
        if (active && request === latest) setResult({ token, status: 'error', data: null });
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [token]);
  // Never render the previous token's private record while the next token loads.
  const current = result.token === token ? result : { status: 'loading', data: null };
  const data = current.data;
  return <main className="max-w-xl mx-auto p-4 space-y-3">
    <h1>{t('mvp2.shared')}</h1><p>{t('mvp2.notice')}</p>
    {current.status === 'loading' ? <p role="status">{t('mvp2.loadingRecord')}</p>
      : current.status === 'error' ? <p role="alert">{t('mvp2.recordError')}</p>
      : data ? <><h2>{data.task}</h2><p>{new Date(data.scheduled_at).toLocaleString(i18n.language)} · {(data.amount_minor / 100).toFixed(2)} {data.currency}</p><p>{data.receipt}</p><p>{data.review}</p></>
      : <p>{t('mvp2.missingRecord')}</p>}
  </main>;
}
