import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import CategoryChips from './CategoryChips';
import { api } from '../lib/api';
import { useUI } from '../context/UIContext';
import type { CategoryId } from '../lib/constants';
import type { Profile } from '../lib/types';

export default function EndorseDialog({
  person,
  open,
  onClose,
  onDone,
}: {
  person: Profile;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { toast, toastError } = useUI();
  const [category, setCategory] = useState<CategoryId | null>(person.skills[0] ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!category) return;
    setBusy(true);
    try {
      await api.endorse(person.id, category, note);
      toast(t('endorse.done'));
      setNote('');
      onDone();
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
      title={t('endorse.title', { name: person.display_name.split(' ')[0] })}
      footer={
        <button className="btn-primary w-full" disabled={!category || busy} onClick={submit}>
          {t('endorse.submit')}
        </button>
      }
    >
      <p className="label">{t('endorse.category')}</p>
      <CategoryChips value={category} onChange={setCategory} />
      <label className="label mt-4" htmlFor="endorse-note">
        {t('endorse.note')}
      </label>
      <textarea
        id="endorse-note"
        className="input min-h-[80px]"
        maxLength={200}
        value={note}
        placeholder={t('endorse.note_placeholder')}
        onChange={(e) => setNote(e.target.value)}
      />
    </Modal>
  );
}
