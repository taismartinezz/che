import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ShieldAlert } from 'lucide-react';
import Avatar from './Avatar';
import CategoryChips from './CategoryChips';
import RichText from './RichText';
import { supabase } from '../lib/supabase';
import { resizeImage } from '../lib/image';
import { CITIES, neighbourhoodsFor, type CategoryId, type CityCode } from '../lib/constants';
import { useUI } from '../context/UIContext';
import type { Profile } from '../lib/types';

const PHONE_RE = /^\+?[0-9 ]{6,20}$/;

interface Props {
  profile: Profile;
  whatsapp: string | null;
  submitLabel: string;
  requireTerms?: boolean;
  onSaved: () => void;
}

export default function ProfileForm({ profile, whatsapp, submitLabel, requireTerms, onSaved }: Props) {
  const { t } = useTranslation();
  const { toastError } = useUI();
  const [name, setName] = useState(profile.display_name);
  const [city, setCity] = useState<CityCode | ''>(profile.city ?? '');
  const [neighbourhood, setNeighbourhood] = useState(profile.neighbourhood ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [skills, setSkills] = useState<CategoryId[]>(profile.skills ?? []);
  const [phone, setPhone] = useState(whatsapp ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return setError(t('errors.upload'));
    setUploading(true);
    setError(null);
    try {
      const blob = await resizeImage(file);
      const { data: old } = await supabase.storage.from('avatars').list(profile.id);
      const path = `${profile.id}/${Date.now()}.jpg`;
      const { error: err } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (err) throw err;
      if (old?.length) await supabase.storage.from('avatars').remove(old.map((f) => `${profile.id}/${f.name}`));
      setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch (e) {
      console.error(e);
      setError(t('errors.upload'));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city || !neighbourhood) return setError(t('onboarding.required'));
    if (phone.trim() && !PHONE_RE.test(phone.trim())) return setError(t('onboarding.whatsapp_invalid'));
    if (requireTerms && !accepted) return setError(t('onboarding.must_accept'));
    setError(null);
    setBusy(true);
    const update: Record<string, unknown> = {
      display_name: name.trim().slice(0, 60),
      city,
      neighbourhood,
      bio: bio.trim() || null,
      skills,
      contact_whatsapp: phone.trim() || null,
      avatar_url: avatarUrl,
      onboarded: true,
    };
    if (requireTerms) update.terms_accepted_at = new Date().toISOString();
    const { error: err } = await supabase.from('profiles').update(update).eq('id', profile.id);
    setBusy(false);
    if (err) return toastError(err);
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="flex items-center gap-4">
        <Avatar id={profile.id} name={name || '?'} url={avatarUrl} size={80} />
        <div className="flex flex-col gap-2 items-start">
          <span className="label mb-0">{t('onboarding.photo')}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Camera size={18} /> {avatarUrl ? t('onboarding.change_photo') : t('onboarding.upload')}
            </button>
            {avatarUrl && (
              <button type="button" className="btn-ghost" onClick={() => setAvatarUrl(null)}>
                {t('onboarding.remove_photo')}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="pf-name">{t('onboarding.name')}</label>
        <input id="pf-name" className="input" maxLength={60} value={name} placeholder={t('onboarding.name_placeholder')} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pf-city">{t('onboarding.city')}</label>
          <select
            id="pf-city"
            className="input"
            value={city}
            onChange={(e) => {
              setCity(e.target.value as CityCode);
              setNeighbourhood('');
            }}
          >
            <option value="">{t('onboarding.choose')}</option>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>{t(`cities.${c.id}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pf-nb">{t('onboarding.neighbourhood')}</label>
          <select id="pf-nb" className="input" value={neighbourhood} onChange={(e) => setNeighbourhood(e.target.value)} disabled={!city}>
            <option value="">{t('onboarding.choose')}</option>
            {neighbourhoodsFor(city || null).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">{t('onboarding.skills')}</span>
        <p className="text-xs text-ink-2 mb-2">{t('onboarding.skills_hint')}</p>
        <CategoryChips multiple value={skills} onChange={setSkills} />
        {skills.includes('cuidado') && !(profile.verification_status === 'verified' && profile.background_checked) && (
          <p className="mt-2 flex gap-2 text-sm rounded-lg bg-soon-bg text-soon p-2">
            <ShieldAlert size={18} className="shrink-0" /> {t('onboarding.cuidado_hint')}
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="pf-bio">{t('onboarding.bio')}</label>
        <textarea id="pf-bio" className="input min-h-[70px]" maxLength={280} value={bio} placeholder={t('onboarding.bio_placeholder')} onChange={(e) => setBio(e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="pf-wa">{t('onboarding.whatsapp')}</label>
        <input id="pf-wa" className="input" inputMode="tel" autoComplete="tel" placeholder="+598 99 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="text-xs text-ink-2 mt-1">{t('onboarding.whatsapp_hint')}</p>
      </div>

      {requireTerms && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" />
          <span className="text-sm">
            <RichText i18nKey="onboarding.accept" />
          </span>
        </label>
      )}

      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      <button type="submit" className="btn-primary w-full h-11 text-[17px]" disabled={busy || uploading}>
        {submitLabel}
      </button>
    </form>
  );
}
