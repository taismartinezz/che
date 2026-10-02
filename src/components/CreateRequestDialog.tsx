import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, ShieldAlert } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import CategoryChips from './CategoryChips';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { MAX_REQUEST_LENGTH, isSensitive, type CategoryId } from '../lib/constants';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  groupId?: string;
}

export default function CreateRequestDialog({ open, onClose, onCreated, groupId }: Props) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstName = me.display_name.split(' ')[0];
  const [myGroups, setMyGroups] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState<string>(groupId ?? '');

  useEffect(() => {
    if (!open) return;
    setTarget(groupId ?? '');
    supabase.rpc('get_groups', { p_city: me.city }).then(({ data }) =>
      setMyGroups(((data ?? []) as { id: string; name: string; is_member: boolean }[]).filter((g) => g.is_member)),
    );
  }, [open, groupId, me.city]);

  const publish = async () => {
    if (!text.trim()) return setError(t('create.empty_text'));
    if (!category) return setError(t('create.choose_category'));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('requests').insert({
      author_id: me.id,
      category,
      text: text.trim(),
      city: me.city,
      neighbourhood: me.neighbourhood,
      group_id: target || null,
    });
    setBusy(false);
    if (err) return toastError(err);
    toast(t('create.published'));
    setText('');
    setCategory(null);
    onCreated?.();
    onClose();
  };

  const remaining = MAX_REQUEST_LENGTH - text.length;
  const short = text.length < 85;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('create.title')}
      footer={
        <>
          {error && <p className="text-danger text-sm mb-2" role="alert">{error}</p>}
          <button className="btn-primary w-full" onClick={publish} disabled={busy || !text.trim()}>
            {busy ? t('create.publishing') : t('create.publish')}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={40} />
        <div>
          <div className="font-semibold">{me.display_name}</div>
          <div className="inline-flex items-center gap-1 rounded bg-field px-2 py-0.5 text-xs font-semibold text-ink-2">
            <MapPin size={12} /> {me.neighbourhood}, {t(`cities.${me.city}`)}
          </div>
        </div>
        {myGroups.length > 0 && (
          <label className="ml-auto text-sm text-ink-2 flex items-center gap-2">
            {t('groups.post_in')}
            <select className="input h-8 py-0 w-auto text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('groups.whole_city', { city: t(`cities.${me.city}`) })}</option>
              {myGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_REQUEST_LENGTH))}
        placeholder={t('create.placeholder', { name: firstName })}
        className={`w-full resize-none bg-transparent focus:outline-none placeholder:text-ink-2 min-h-[140px] ${short ? 'text-2xl' : 'text-[17px]'}`}
        aria-label={t('create.title')}
      />
      <div className={`text-right text-xs ${remaining < 20 ? 'text-danger' : 'text-ink-2'}`}>{remaining}</div>
      <div className="border border-divider rounded-lg p-3 mt-2">
        <div className="text-sm font-semibold mb-2">{t('create.category')}</div>
        <CategoryChips value={category} onChange={setCategory} />
      </div>
      {category && isSensitive(category) && (
        <p className="mt-3 flex gap-2 text-sm rounded-lg bg-soon-bg text-soon p-2">
          <ShieldAlert size={18} className="shrink-0" /> {t('create.sensitive_note')}
        </p>
      )}
      <p className="text-xs text-ink-2 mt-3">{t('create.privacy_note')}</p>
    </Modal>
  );
}
