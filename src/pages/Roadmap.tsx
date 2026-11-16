import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThumbsUp } from 'lucide-react';
import Layout from '../components/Layout';
import { SOON_STAGE, type SoonFeature } from '../lib/constants';
import { useUI } from '../context/UIContext';
import { useMe } from '../context/AuthContext';
import { ayudaApi } from '../lib/ayuda';

const TODAY = ['requests', 'offers', 'network', 'recs', 'intros', 'exchanges', 'chat', 'groups', 'share', 'safety', 'lang'];
const COMING: SoonFeature[] = ['payments', 'registered_worker', 'invoices'];

export default function Roadmap() {
  const { t } = useTranslation();
  const { showSoon, toastError } = useUI();
  const { me } = useMe();
  const [votos, setVotos] = useState<Record<string, { votos: number; yo: boolean }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await ayudaApi.roadmapConteo();
      setVotos(Object.fromEntries(rows.map((r) => [r.funcion, { votos: r.votos, yo: r.yo }])));
    } catch {
      /* counts are optional */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const votar = async (f: string) => {
    const cur = votos[f] ?? { votos: 0, yo: false };
    setBusy(f);
    // Optimistic: one vote per person per feature (the database enforces it).
    setVotos((v) => ({ ...v, [f]: { votos: cur.votos + (cur.yo ? -1 : 1), yo: !cur.yo } }));
    try {
      await ayudaApi.votar(me.id, f, !cur.yo);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load();
    }
  };
  return (
    <Layout variant="full">
      <div className="max-w-[680px] mx-auto space-y-3 sm:space-y-4">
        <section className="card p-4">
          <p className="text-sm text-ink-2">{t('roadmap.title')}</p>
          <h1 className="text-2xl font-semibold mt-1">{t('app.mission_title')}</h1>
          <p className="mt-1">{t('app.mission')}</p>
          <p className="mt-3 text-sm text-ink-2">{t('roadmap.intro')}</p>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">{t('mvp2.configured')}</h2>
          <p className="text-sm text-ink-2 mb-3">{t('mvp2.configuredBody')}</p>
          <ul className="space-y-2">
            {TODAY.map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="grow">{t(`roadmap.items_today.${k}`)}</span>
                <span className="tag-ok shrink-0">{t('mvp2.configured')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">{t('mvp2.testing')}</h2>
          <p>{t('mvp2.testingBody')}</p>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">{t('roadmap.coming')}</h2>
          <ul className="space-y-1">
            {COMING.map((f) => {
              const v = votos[f] ?? { votos: 0, yo: false };
              return (
              <li key={f} className="flex items-center gap-2">
                <button className="grow min-w-0 text-left flex items-start gap-3 rounded-lg p-2 -ml-2 hover:bg-hover" onClick={() => showSoon(f)}>
                  <span className="grow">
                    <span className="block">{t(`soon.features.${f}.title`)}</span>
                    <span className="text-sm text-ink-2 line-clamp-2">{t(`soon.features.${f}.desc`)}</span>
                  </span>
                  <span className="tag-soon shrink-0">
                    {t('soon.tag')} · {t(`soon.stages.${SOON_STAGE[f]}`)}
                  </span>
                </button>
                <button
                  className={`shrink-0 flex flex-col items-center justify-center min-w-[68px] h-14 rounded-lg border text-xs font-semibold ${
                    v.yo ? 'border-brand bg-brand-soft text-brand' : 'border-divider text-ink-2 hover:bg-hover'
                  }`}
                  aria-pressed={v.yo}
                  aria-label={t('ayuda.roadmap.vote_aria', { name: t(`soon.features.${f}.title`), count: v.votos })}
                  disabled={busy === f}
                  onClick={() => votar(f)}
                >
                  <ThumbsUp size={18} strokeWidth={v.yo ? 2.4 : 1.8} aria-hidden />
                  <span className="tabular-nums">{v.votos}</span>
                  <span className="sr-only">{v.yo ? t('ayuda.roadmap.voted') : t('ayuda.roadmap.vote')}</span>
                </button>
              </li>
              );
            })}
          </ul>
        </section>
        <p className="text-center text-sm text-ink-2 px-4">{t('app.disclaimer')}</p>
      </div>
    </Layout>
  );
}
