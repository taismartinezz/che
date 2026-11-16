import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { moneyToMinor, type Agreement } from '../lib/mvp2';
import { recordPdf } from '../lib/recordPdf';

interface AgreementEvent { id: number; agreement_id: string; actor_id: string | null; action: string; body: string | null; created_at: string }
const eventKeys: Record<string, string> = { propose: 'historyPropose', accept: 'historyAccept', simulate_payment: 'historyPayment', finish: 'historyFinish', report: 'historyReport', respond: 'historyRespond', redo_done: 'historyRedo', escalate: 'historyEscalate', review: 'historyReview', share: 'historyShare', revoke_share: 'historyRevoke', close_mediation: 'historyClose' };

export default function TestAgreements({ me, otherId, moderation = false }: { me: string; otherId?: string; moderation?: boolean }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [events, setEvents] = useState<AgreementEvent[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [share, setShare] = useState('');
  const load = useCallback(async () => {
    let q = supabase.from('test_agreements').select('*').order('created_at', { ascending: false });
    if (moderation) q = q.eq('problem', 'mediation');
    else if (otherId) q = q.or(`and(client_id.eq.${me},worker_id.eq.${otherId}),and(client_id.eq.${otherId},worker_id.eq.${me})`);
    else q = q.eq('worker_id', me).eq('status', 'completed');
    const { data, error: e } = await q;
    setError(Boolean(e)); setRows((data ?? []) as Agreement[]);
    if (data?.length) {
      const { data: history, error: historyError } = await supabase.from('test_agreement_events').select('*').in('agreement_id', data.map(a => a.id)).order('id');
      setEvents((history ?? []) as AgreementEvent[]);
      if (historyError) setError(true);
    } else setEvents([]);
  }, [me, otherId, moderation]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  const act = async (id: string, action: string) => {
    setBusy(true); setError(false);
    const { data, error: e } = await supabase.rpc('act_test_agreement', { p_id: id, p_action: action, p_text: texts[id] ?? null });
    if (e) setError(true);
    else {
      const updated = (Array.isArray(data) ? data[0] : data) as Agreement;
      if (action === 'share') setShare(`${window.location.origin}/antecedente/${updated.share_token}`);
      if (action === 'revoke_share') setShare('');
      await load();
    }
    setBusy(false);
  };
  const propose = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    setBusy(true); setError(false);
    try {
      const { error: err } = await supabase.rpc('propose_test_agreement', {
        p_other: otherId, p_worker: f.get('worker') ? me : otherId,
        p_task: f.get('task'), p_scheduled_at: new Date(String(f.get('date'))).toISOString(),
        p_amount_minor: moneyToMinor(String(f.get('amount'))), p_currency: f.get('currency'),
      });
      if (err) throw err;
      form.reset(); await load();
    } catch { setError(true); }
    setBusy(false);
  };
  const button = (a: Agreement, action: string, label: string, disabled = false) => <button type="button" className="btn-secondary text-sm" disabled={busy || disabled} onClick={() => act(a.id, action)}>{t(`mvp2.${label}`)}</button>;
  const download = (a: Agreement) => {
    const url = URL.createObjectURL(recordPdf([
      t('mvp2.record'), t('mvp2.notice'), a.id, a.task,
      new Date(a.scheduled_at).toLocaleString(i18n.language), `${a.amount_minor / 100} ${a.currency}`,
      `${t('mvp2.receipt')}: ${a.receipt ?? ''}`, `${t('mvp2.review')}: ${a.review ?? ''}`,
    ]));
    const link = document.createElement('a'); link.href = url; link.download = `che-test-${a.id}.pdf`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="card p-3 space-y-3">
    <h2 className="font-semibold">{t(`mvp2.${moderation ? 'queue' : otherId ? 'title' : 'record'}`)}</h2>
    <p className="text-sm text-ink-2">{t('mvp2.notice')}</p>
    {error && <p role="alert">{t('mvp2.error')}</p>}
    {otherId && <form onSubmit={propose} className="space-y-2">
      <label className="block">{t('mvp2.task')}<input className="input" name="task" required maxLength={500} /></label>
      <label className="block">{t('mvp2.date')}<input className="input" name="date" type="datetime-local" required /></label>
      <label className="block">{t('mvp2.price')}<input className="input" name="amount" inputMode="decimal" required pattern="[0-9]{1,8}([.][0-9]{1,2})?" /></label>
      <label className="block">{t('mvp2.currency')}<select className="input" name="currency"><option>UYU</option><option>ARS</option></select></label>
      <label className="flex gap-2"><input name="worker" type="checkbox" />{t('mvp2.worker')}</label>
      <button className="btn-secondary" disabled={busy}>{t('mvp2.propose')}</button>
    </form>}
    {!rows.length && !error && <p>{t('mvp2.empty')}</p>}
    {share && <label className="block">{t('mvp2.copy')}<input className="input" readOnly value={share} onFocus={e => e.target.select()} /></label>}
    {rows.map(a => <article key={a.id} className="border border-divider rounded-lg p-3 space-y-2">
      <h3 className="font-semibold whitespace-pre-wrap">{a.task}</h3>
      <p>{new Date(a.scheduled_at).toLocaleString(i18n.language)} · {(a.amount_minor / 100).toFixed(2)} {a.currency}</p>
      <p>{t(`mvp2.${a.status}`)} · {t(`mvp2.${a.payment_state}`)}</p>
      <p className="text-xs">{t('mvp2.confirmations')}: {a.accepted_by.length}/2 · {t('mvp2.finishes')}: {a.finished_by.length}/2</p>
      <details><summary className="cursor-pointer">{t('mvp2.history')}</summary>
        <ol className="space-y-2 text-sm mt-2">{events.filter(e => e.agreement_id === a.id).map(e => <li key={e.id}>
          <p>{new Date(e.created_at).toLocaleString(i18n.language)} · {t(`mvp2.${eventKeys[e.action] ?? 'history'}`)}</p>
          {e.body && <p className="whitespace-pre-wrap">{e.body}</p>}
        </li>)}</ol>
      </details>
      {moderation ? <>
        {Object.entries(a.versions).map(([id, text]) => <p key={id} className="whitespace-pre-wrap">{id}: {text}</p>)}
        {button(a, 'close_mediation', 'close')}
      </> : <>
        {a.status === 'proposed' && button(a, 'accept', 'accept', a.accepted_by.includes(me))}
        {a.status === 'confirmed' && a.problem === 'none' && <>
          {a.payment_state === 'unfunded' && a.client_id === me && button(a, 'simulate_payment', 'fund')}
          {a.payment_state === 'simulated_held' && button(a, 'finish', 'finish', a.finished_by.includes(me))}
        </>}
        {a.status === 'confirmed' && <>
          <label className="block">{t('mvp2.version')}<textarea className="input" maxLength={2000} value={texts[a.id] ?? ''} onChange={e => setTexts(v => ({ ...v, [a.id]: e.target.value }))} /></label>
          {a.problem === 'none' ? button(a, 'report', 'report', !texts[a.id]?.trim()) : <>
            <p>{t('mvp2.redo')}</p>
            {Object.entries(a.versions).map(([id, text]) => <p key={id} className="whitespace-pre-wrap">{id}: {text}</p>)}
            {['redo','mediation'].includes(a.problem) && button(a, 'respond', 'respond', !texts[a.id]?.trim())}
            {a.problem === 'redo' && <>{button(a, 'redo_done', 'redoDone')}{button(a, 'escalate', 'escalate')}</>}
          </>}
        </>}
        {a.status === 'completed' && <>
          <p>{t('mvp2.receipt')}: {a.receipt}</p>
          {a.review && <p className="whitespace-pre-wrap">{a.review}</p>}
          {a.client_id === me && <>
            <label className="block">{t('mvp2.review')}<textarea className="input" maxLength={1000} value={texts[a.id] ?? ''} onChange={e => setTexts(v => ({ ...v, [a.id]: e.target.value }))} /></label>
            {button(a, 'review', 'saveReview', !texts[a.id]?.trim())}
          </>}
          <button className="btn-secondary" onClick={() => download(a)}>{t('mvp2.pdf')}</button>
          {a.worker_id === me && <>{button(a, 'share', 'share')}{a.share_token && button(a, 'revoke_share', 'revoke')}</>}
        </>}
      </>}
    </article>)}
  </section>;
}
