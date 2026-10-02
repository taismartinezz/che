import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { api } from '../lib/api';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

const REASONS = ['spam', 'fake', 'unsafe', 'inappropriate', 'other'] as const;

export default function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'profile' | 'request';
  targetId: string;
}) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await api.report(me.id, targetType, targetId, `${reason}${details.trim() ? `: ${details.trim()}` : ''}`.slice(0, 500));
      toast(t('safety.reported'));
      setDetails('');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(targetType === 'profile' ? 'safety.report_profile' : 'safety.report_request')}
      footer={
        <button className="btn-primary w-full" onClick={send} disabled={busy}>
          {t('safety.send')}
        </button>
      }
    >
      <fieldset className="space-y-1">
        <legend className="label mb-2">{t('safety.reason')}</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover cursor-pointer">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[rgb(var(--brand))] h-4 w-4" />
            {t(`safety.reasons.${r}`)}
          </label>
        ))}
      </fieldset>
      <label className="label mt-3" htmlFor="report-details">
        {t('safety.details')}
      </label>
      <textarea id="report-details" className="input min-h-[80px]" maxLength={400} value={details} onChange={(e) => setDetails(e.target.value)} />
    </Modal>
  );
}
