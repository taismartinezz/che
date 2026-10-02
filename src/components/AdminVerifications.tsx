import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RowSkeleton } from './States';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/time';

interface Pending {
  id: string;
  user_id: string;
  display_name: string;
  city: string | null;
  neighbourhood: string | null;
  skills: string[];
  id_document_path: string;
  selfie_path: string;
  background_path: string | null;
  created_at: string;
}

function Row({ v, onDone }: { v: Pending; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { toastError } = useUI();
  const [backgroundOk, setBackgroundOk] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Private files: open a short-lived signed URL.
  const view = async (path: string) => {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    const { data, error } = await supabase.storage.from('verification').createSignedUrl(path, 120);
    if (error || !data) {
      win?.close();
      return toastError(error);
    }
    if (win) win.location.href = data.signedUrl;
  };

  const decide = async (approve: boolean) => {
    setBusy(true);
    const files = [v.id_document_path, v.selfie_path, v.background_path].filter(Boolean) as string[];
    const { error } = await supabase.rpc('admin_review_verification', {
      p_request: v.id,
      p_approve: approve,
      p_background_ok: backgroundOk,
      p_note: note,
    });
    if (error) {
      setBusy(false);
      return toastError(error);
    }
    // Documents are only kept until the decision.
    await supabase.storage.from('verification').remove(files);
    onDone();
  };

  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link to={`/perfil/${v.user_id}`} className="font-medium hover:underline">{v.display_name}</Link>
        <span className="text-sm text-ink-2">
          {[v.neighbourhood, v.skills.map((s) => t(`categories.${s}`)).join(', '), timeAgo(v.created_at, i18n.language)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary h-8 text-sm" onClick={() => view(v.id_document_path)}>{t('admin.view_id')}</button>
        <button className="btn-secondary h-8 text-sm" onClick={() => view(v.selfie_path)}>{t('admin.view_selfie')}</button>
        {v.background_path && (
          <button className="btn-secondary h-8 text-sm" onClick={() => view(v.background_path!)}>{t('admin.view_background')}</button>
        )}
      </div>
      {v.background_path && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={backgroundOk} onChange={(e) => setBackgroundOk(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
          {t('admin.background_ok')}
        </label>
      )}
      <input className="input" placeholder={t('admin.note')} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-primary h-8 text-sm" disabled={busy} onClick={() => decide(true)}>{t('admin.approve')}</button>
        <button className="btn-secondary h-8 text-sm" disabled={busy} onClick={() => decide(false)}>{t('admin.reject')}</button>
      </div>
    </li>
  );
}

export default function AdminVerifications() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Pending[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_list_verifications');
    setItems((data ?? []) as Pending[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card p-4">
      <h2 className="font-semibold mb-1">{t('admin.verifications')}</h2>
      {items === null ? (
        <RowSkeleton rows={2} />
      ) : items.length === 0 ? (
        <p className="text-ink-2">{t('admin.no_verifications')}</p>
      ) : (
        <ul className="divide-y divide-divider">
          {items.map((v) => (
            <Row key={v.id} v={v} onDone={load} />
          ))}
        </ul>
      )}
    </section>
  );
}
