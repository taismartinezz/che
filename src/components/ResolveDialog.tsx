import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Avatar from './Avatar';
import { RowSkeleton } from './States';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { PROFILE_MINI } from '../lib/constants';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { MiniProfile, RequestRow } from '../lib/types';

export default function ResolveDialog({
  request,
  open,
  onClose,
  onDone,
}: {
  request: Pick<RequestRow, 'id' | 'author_id'>;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { friends } = useData();
  const { toast, toastError } = useUI();
  const [candidates, setCandidates] = useState<MiniProfile[] | null>(null);
  const [helper, setHelper] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCandidates(null);
    (async () => {
      const [{ data: offers }, { data: intros }] = await Promise.all([
        supabase.from('offers').select('helper_id').eq('request_id', request.id),
        supabase.from('intro_requests').select('target_id').eq('request_id', request.id).eq('target_status', 'accepted'),
      ]);
      const ids = [
        ...new Set([...(offers ?? []).map((o) => o.helper_id as string), ...(intros ?? []).map((i) => i.target_id as string)]),
      ];
      let list: MiniProfile[] = [];
      if (ids.length) {
        const { data } = await supabase.from('profiles').select(PROFILE_MINI).in('id', ids);
        list = (data ?? []) as MiniProfile[];
      }
      for (const f of friends) if (!list.some((x) => x.id === f.id)) list.push(f);
      setCandidates(list);
      setHelper(list[0]?.id ?? null);
    })();
  }, [open, request.id, friends]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.resolveRequest(request.id, helper, note);
      toast(t('resolve.done'));
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
      title={t('resolve.title')}
      footer={
        <button className="btn-primary w-full" disabled={busy || candidates === null} onClick={submit}>
          {t('resolve.submit')}
        </button>
      }
    >
      <p className="label">{t('resolve.who')}</p>
      <p className="text-xs text-ink-2 mb-2">{t('resolve.pick_hint')}</p>
      {candidates === null ? (
        <RowSkeleton rows={3} />
      ) : (
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {candidates.map((c) => (
            <label key={c.id} className={`flex items-center gap-3 rounded-lg p-2 cursor-pointer ${helper === c.id ? 'bg-brand-soft' : 'hover:bg-hover'}`}>
              <input type="radio" name="helper" checked={helper === c.id} onChange={() => setHelper(c.id)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
              <Avatar id={c.id} name={c.display_name} url={c.avatar_url} size={36} />
              <span className="font-medium">{c.display_name}</span>
            </label>
          ))}
          <label className={`flex items-center gap-3 rounded-lg p-2 cursor-pointer ${helper === null ? 'bg-brand-soft' : 'hover:bg-hover'}`}>
            <input type="radio" name="helper" checked={helper === null} onChange={() => setHelper(null)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
            <span className="text-ink-2">{t('resolve.nobody')}</span>
          </label>
        </div>
      )}
      {helper && (
        <>
          <label className="label mt-4" htmlFor="thanks">
            {t('resolve.note')}
          </label>
          <textarea
            id="thanks"
            className="input min-h-[80px]"
            maxLength={280}
            value={note}
            placeholder={t('resolve.note_placeholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
    </Modal>
  );
}
