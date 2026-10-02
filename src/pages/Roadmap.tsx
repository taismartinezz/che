import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import { SOON_STAGE, type SoonFeature } from '../lib/constants';
import { useUI } from '../context/UIContext';

const TODAY = ['requests', 'offers', 'network', 'recs', 'intros', 'exchanges', 'safety', 'lang'];
const COMING: SoonFeature[] = ['chat', 'notifications', 'groups', 'share', 'verification', 'payments', 'registered_worker', 'invoices'];

export default function Roadmap() {
  const { t } = useTranslation();
  const { showSoon } = useUI();
  return (
    <Layout variant="full">
      <div className="max-w-[680px] mx-auto space-y-3 sm:space-y-4">
        <section className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand to-brand-hover text-white p-6">
            <p className="text-sm font-semibold opacity-90">{t('roadmap.title')}</p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">{t('app.mission_title')}</h1>
            <p className="mt-2 text-[17px] opacity-95">{t('app.mission')}</p>
          </div>
          <p className="p-4 text-sm text-ink-2">{t('roadmap.intro')}</p>
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-bold mb-3">{t('roadmap.today')}</h2>
          <ul className="space-y-2">
            {TODAY.map((k) => (
              <li key={k} className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
                <span className="grow">{t(`roadmap.items_today.${k}`)}</span>
                <span className="tag-ok shrink-0">{t('roadmap.available')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-bold mb-3">{t('roadmap.coming')}</h2>
          <ul className="space-y-1">
            {COMING.map((f) => (
              <li key={f}>
                <button className="w-full text-left flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-hover" onClick={() => showSoon(f)}>
                  <Clock size={20} className="text-soon shrink-0 mt-0.5" />
                  <span className="grow">
                    <span className="font-medium block">{t(`soon.features.${f}.title`)}</span>
                    <span className="text-sm text-ink-2 line-clamp-2">{t(`soon.features.${f}.desc`)}</span>
                  </span>
                  <span className="tag-soon shrink-0">
                    {t('soon.tag')} · {t(`soon.stages.${SOON_STAGE[f]}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-center text-sm text-ink-2 px-4">{t('app.disclaimer')}</p>
      </div>
    </Layout>
  );
}
