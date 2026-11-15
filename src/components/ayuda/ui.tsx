import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Phone, X } from 'lucide-react';
import Layout from '../Layout';
import { useAuth } from '../../context/AuthContext';
import { PublicFooter } from '../../pages/Login';
import { fileProblem, MAX_ADJUNTOS, type ReclamoEstado } from '../../lib/ayuda';

/** Signed in → the normal app shell. Signed out (e.g. /ayuda from the login footer) → a simple public page. */
export function AyudaShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  if (profile?.onboarded)
    return (
      <Layout variant="full">
        <div className="max-w-[680px] mx-auto space-y-3 sm:space-y-4">{children}</div>
      </Layout>
    );
  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="h-14 bg-card border-b border-divider flex items-center px-4 gap-3">
        <Link to="/" className="text-xl font-bold text-brand">che</Link>
        <span className="font-semibold">{t('ayuda.title')}</span>
      </header>
      <main className="grow w-full max-w-[680px] mx-auto py-3 sm:py-4 sm:px-4 space-y-3 sm:space-y-4">{children}</main>
      <PublicFooter />
    </div>
  );
}

/** Radio options as large tappable rows (keyboard: arrows move between options, as native radios). */
export function RadioRows<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  legend: string;
  name: string;
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  error?: string | null;
  hint?: string;
}) {
  const errId = useId();
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="label mb-2">{legend}</legend>
      {hint && <p className="text-sm text-ink-2 -mt-1 mb-2">{hint}</p>}
      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex items-center gap-3 rounded-lg border px-3 min-h-[48px] py-2 cursor-pointer ${
              value === o.value ? 'border-brand bg-brand-soft' : 'border-divider hover:bg-hover'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
            />
            <span className="text-[15px]">{o.label}</span>
          </label>
        ))}
      </div>
      <FieldError id={errId} text={error} />
    </fieldset>
  );
}

export function FieldError({ id, text }: { id?: string; text?: string | null }) {
  if (!text) return null;
  return (
    <p id={id} className="text-danger text-sm mt-1" role="alert">
      {text}
    </p>
  );
}

const ESTADO_STYLE: Record<ReclamoEstado, string> = {
  recibido: 'bg-field text-ink',
  en_revision: 'bg-brand-soft text-brand',
  esperando_respuesta: 'bg-soon-bg text-soon',
  resuelto: 'bg-success/15 text-success',
  cerrado: 'bg-field text-ink-2',
};

export function EstadoTag({ estado }: { estado: ReclamoEstado }) {
  const { t } = useTranslation();
  return <span className={`tag ${ESTADO_STYLE[estado]}`}>{t(`ayuda.estados.${estado}`)}</span>;
}

/** Shown on top when someone felt unsafe: emergency numbers + block right away. */
export function EmergencyBanner({ name, onBlock, blocked }: { name?: string; onBlock?: () => void; blocked?: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-card border-2 border-danger bg-card p-4 space-y-2" role="alert" aria-labelledby="emergencia-titulo">
      <h2 id="emergencia-titulo" className="font-bold text-lg flex items-center gap-2">
        <Phone size={20} className="text-danger shrink-0" aria-hidden /> {t('ayuda.emergency.title')}
      </h2>
      <p className="text-[15px]">{t('ayuda.emergency.body')}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <a href="tel:911" className="btn-danger h-11 px-5">
          911
        </a>
        {name && onBlock && !blocked && (
          <button type="button" className="btn-secondary h-11" onClick={onBlock}>
            {t('ayuda.emergency.block', { name })}
          </button>
        )}
        {blocked && name && <p className="text-sm text-ink-2 self-center">{t('ayuda.emergency.blocked', { name })}</p>}
      </div>
    </section>
  );
}

function Thumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return <img src={src} alt={file.name} className="h-20 w-20 rounded-lg object-cover border border-divider" />;
}

/** Picks up to `max` images, with previews and per-file errors. */
export function ImagePicker({
  files,
  onChange,
  max = MAX_ADJUNTOS,
  label,
  hint,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  max?: number;
  label: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    let err: string | null = null;
    for (const f of Array.from(list)) {
      const p = fileProblem(f);
      if (p) err = t(p === 'size' ? 'ayuda.reclamo.files_too_big' : 'ayuda.reclamo.files_type', { name: f.name });
      else if (next.length < max) next.push(f);
    }
    setError(err);
    onChange(next);
    if (input.current) input.current.value = '';
  };

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {hint && <p className="text-sm text-ink-2 mb-2">{hint}</p>}
      <ul className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="relative">
            <Thumb file={f} />
            <button
              type="button"
              className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-ink text-page flex items-center justify-center"
              aria-label={t('ayuda.reclamo.files_remove', { name: f.name })}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          </li>
        ))}
        {files.length < max && (
          <li>
            <button
              type="button"
              className="h-20 w-20 rounded-lg border-2 border-dashed border-divider text-ink-2 hover:bg-hover flex flex-col items-center justify-center gap-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={20} aria-hidden />
              {t('ayuda.reclamo.files_add')}
            </button>
          </li>
        )}
      </ul>
      <input
        id={id}
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={max > 1}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => add(e.target.files)}
      />
      <FieldError text={error} />
    </div>
  );
}
