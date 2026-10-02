import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import { EmptyState, RowSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/time';

interface Report {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  target_type: 'profile' | 'request';
  target_id: string;
  target_label: string | null;
  reason: string;
  created_at: string;
}
interface Metrics {
  requests_posted: number;
  requests_with_offer_pct: number;
  intros_requested: number;
  intros_accepted: number;
  exchanges_completed: number;
  weekly_active_users: number;
  total_users: number;
}

export default function Admin() {
  const { t, i18n } = useTranslation();
  const { priv } = useMe();
  const { toastError } = useUI();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const load = useCallback(async () => {
    const [{ data: r, error }, { data: m }] = await Promise.all([supabase.rpc('admin_list_reports'), supabase.rpc('admin_metrics')]);
    if (error) toastError(error);
    setReports((r ?? []) as Report[]);
    setMetrics(((Array.isArray(m) ? m[0] : m) as Metrics) ?? null);
  }, [toastError]);

  useEffect(() => {
    if (priv.is_admin) load();
  }, [priv.is_admin, load]);

  if (!priv.is_admin)
    return (
      <Layout variant="full">
        <EmptyState title={t('admin.forbidden')} />
      </Layout>
    );

  const run = async (fn: string, args: Record<string, string>) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) toastError(error);
    load();
  };

  const tiles: [string, string | number, string?][] = metrics
    ? [
        [t('admin.m_requests'), metrics.requests_posted],
        [t('admin.m_offer_pct'), `${metrics.requests_with_offer_pct}%`],
        [t('admin.m_intros'), metrics.intros_accepted, t('admin.of', { count: metrics.intros_requested })],
        [t('admin.m_exchanges'), metrics.exchanges_completed],
        [t('admin.m_wau'), metrics.weekly_active_users, t('admin.of', { count: metrics.total_users })],
      ]
    : [];

  return (
    <Layout variant="full">
      <h1 className="text-2xl font-bold px-1">{t('admin.title')}</h1>
      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">{t('admin.metrics')}</h2>
        {!metrics ? (
          <RowSkeleton rows={2} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className="rounded-lg bg-field p-3">
                <div className="text-2xl font-bold text-brand tabular-nums">{value}</div>
                <div className="text-xs text-ink-2 leading-snug">{label}</div>
                {sub && <div className="text-xs text-ink-2">{sub}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">{t('admin.reports')}</h2>
        {reports === null ? (
          <RowSkeleton rows={3} />
        ) : reports.length === 0 ? (
          <p className="text-ink-2">{t('admin.no_reports')}</p>
        ) : (
          <ul className="divide-y divide-divider">
            {reports.map((r) => (
              <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="grow min-w-0 text-sm">
                  <div>
                    <span className="tag bg-field text-ink-2 mr-1">{r.target_type}</span>
                    <strong>{r.target_label ?? r.target_id}</strong>
                  </div>
                  <div className="text-ink-2">
                    {t('admin.reporter')}: {r.reporter_name ?? '—'} · {timeAgo(r.created_at, i18n.language)}
                  </div>
                  <div className="mt-1">{r.reason}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link className="btn-secondary h-8 text-sm" to={r.target_type === 'profile' ? `/perfil/${r.target_id}` : `/pedido/${r.target_id}`}>
                    {t('admin.view')}
                  </Link>
                  {r.target_type === 'request' && (
                    <button className="btn-secondary h-8 text-sm" onClick={() => run('admin_close_request', { p_request: r.target_id })}>
                      {t('admin.close_request')}
                    </button>
                  )}
                  <button className="btn-ghost h-8 text-sm" onClick={() => run('admin_dismiss_report', { p_report: r.id })}>
                    {t('admin.dismiss')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}
