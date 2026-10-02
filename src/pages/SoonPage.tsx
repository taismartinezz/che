import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import { SoonTag } from '../components/ComingSoonDialog';
import { SOON_STAGE, type SoonFeature } from '../lib/constants';

/** Full-page version of the coming-soon explainer (Grupos, Pagos tabs). */
export default function SoonPage({ feature }: { feature: SoonFeature }) {
  const { t } = useTranslation();
  return (
    <Layout>
      <section className="card p-6 flex flex-col items-start gap-3">
        <SoonTag />
        <h1 className="text-xl font-semibold">{t(`soon.features.${feature}.title`)}</h1>
        <p className="max-w-md">{t(`soon.features.${feature}.desc`)}</p>
        <p className="text-sm text-ink-2">
          {t('soon.stage_label')}: <strong className="text-ink">{t(`soon.stages.${SOON_STAGE[feature]}`)}</strong>
        </p>
        <p className="text-xs text-ink-2">{t('soon.honest')}</p>
      </section>
    </Layout>
  );
}
