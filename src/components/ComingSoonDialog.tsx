import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import Modal from './Modal';
import { SOON_STAGE, type SoonFeature } from '../lib/constants';

export function SoonTag({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return <span className={`tag-soon ${className}`}>{t('soon.tag')}</span>;
}

export default function ComingSoonDialog({ feature, onClose }: { feature: SoonFeature | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!feature) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t(`soon.features.${feature}.title`)}
      footer={
        <button className="btn-primary w-full" onClick={onClose}>
          {t('soon.ok')}
        </button>
      }
    >
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="h-14 w-14 rounded-full bg-soon-bg text-soon flex items-center justify-center">
          <Clock size={28} />
        </div>
        <SoonTag />
        <p className="text-[15px] leading-relaxed">{t(`soon.features.${feature}.desc`)}</p>
        <p className="text-sm text-ink-2">
          {t('soon.stage_label')}: <strong className="text-ink">{t(`soon.stages.${SOON_STAGE[feature]}`)}</strong>
        </p>
        <p className="text-xs text-ink-2">{t('soon.honest')}</p>
      </div>
    </Modal>
  );
}
