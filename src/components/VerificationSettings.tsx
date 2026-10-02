import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';

const MAX = 10 * 1024 * 1024;

function FileField({ id, label, file, onChange }: { id: string; label: string; file: File | null; onChange: (f: File | null) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="btn-secondary cursor-pointer shrink-0">{t('verify.choose_file')}</label>
        <span className="text-sm text-ink-2 truncate">{file?.name ?? ''}</span>
      </div>
      <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

export default function VerificationSettings() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { refreshProfile } = useAuth();
  const { toast, toastError } = useUI();
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wantsCare = me.skills.includes('cuidado');

  const submit = async () => {
    if (!idDoc || !selfie) return setError(t('verify.missing'));
    if (wantsCare && !background) return setError(t('verify.missing_background'));
    if ([idDoc, selfie, background].some((f) => f && f.size > MAX)) return setError(t('verify.too_big'));
    setError(null);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      const put = async (f: File, kind: string) => {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${me.id}/${Date.now()}-${kind}.${ext}`;
        const { error: err } = await supabase.storage.from('verification').upload(path, f, { contentType: f.type });
        if (err) throw err;
        uploaded.push(path);
        return path;
      };
      const idPath = await put(idDoc, 'id');
      const selfiePath = await put(selfie, 'selfie');
      const bgPath = background ? await put(background, 'background') : null;
      const { error: err } = await supabase.rpc('submit_verification', { p_id_document: idPath, p_selfie: selfiePath, p_background: bgPath });
      if (err) throw err;
      toast(t('verify.submitted'));
      await refreshProfile();
    } catch (e) {
      if (uploaded.length) await supabase.storage.from('verification').remove(uploaded);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4" id="verificacion">
      <h2 className="font-semibold mb-1">{t('verify.title')}</h2>
      {me.verification_status === 'verified' ? (
        <p className="text-success">
          {t('verify.verified')} {me.background_checked && t('verify.background_ok')}
        </p>
      ) : me.verification_status === 'pending' ? (
        <p className="text-ink-2">{t('verify.pending')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{t('verify.intro')}</p>
          <p className="text-sm text-ink-2">{t('verify.care_intro')}</p>
          <FileField id="v-id" label={t('verify.id_document')} file={idDoc} onChange={setIdDoc} />
          <FileField id="v-selfie" label={t('verify.selfie')} file={selfie} onChange={setSelfie} />
          <FileField
            id="v-bg"
            label={wantsCare ? t('verify.background') : t('verify.background_optional')}
            file={background}
            onChange={setBackground}
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" />
            <span className="text-sm">{t('verify.consent')}</span>
          </label>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={!consent || busy} onClick={submit}>
            {t('verify.submit')}
          </button>
        </div>
      )}
    </section>
  );
}
