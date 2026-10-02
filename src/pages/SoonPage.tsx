import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import Layout from '../components/Layout';
import { SoonTag } from '../components/ComingSoonDialog';
import { SOON_STAGE, type SoonFeature } from '../lib/constants';

/** Full-page version of the coming-soon explainer (Grupos, Pagos tabs). */
export default function SoonPage({ feature }: { feature: SoonFeature }) {
  const { t } = useTranslation();
  return (
    <Layout>
      <section className="card p-8 flex flex-col items-center text-center gap-3">
        <div className="h-16 w-16 rounded-full bg-soon-bg text-soon flex items-center justify-center">
          <Clock size={32} />
        </div>
        <SoonTag />
        <h1 className="text-2xl font-bold">{t(`soon.features.${feature}.title`)}</h1>
        <p className="text-[17px] max-w-md">{t(`soon.features.${feature}.desc`)}</p>
        <p className="text-sm text-ink-2">
          {t('soon.stage_label')}: <strong className="text-ink">{t(`soon.stages.${SOON_STAGE[feature]}`)}</strong>
        </p>
        <p className="text-xs text-ink-2">{t('soon.honest')}</p>
      </section>
    </Layout>
  );
}
