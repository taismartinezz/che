import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { RowSkeleton } from '../../components/States';
import { AyudaShell, EmergencyBanner, FieldError, ImagePicker, RadioRows } from '../../components/ayuda/ui';
import { useMe } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { api } from '../../lib/api';
import {
  ayudaApi,
  fechaCorta,
  hoyISO,
  MIN_DESCRIPCION,
  MOTIVOS,
  RESULTADOS,
  subirImagenPrivada,
  type Candidato,
  type ReclamoMotivo,
  type ReclamoResultado,
  type ReclamoRol,
} from '../../lib/ayuda';

const TOTAL = 5;
type Errors = Partial<Record<'who' | 'role' | 'motivo' | 'what' | 'date' | 'outcome', string>>;

/**
 * /ayuda/reclamo — step by step. Can come prefilled from a profile, a chat or a rating:
 *   ?con=<user id>&chat=1&favor=<exchange id>&rol=pedi|hice&fecha=YYYY-MM-DD
 */
export default function Reclamo() {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const { refreshNetwork } = useData();
  const { toastError } = useUI();
  const [params] = useSearchParams();

  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(1);
  const [contra, setContra] = useState<string | null>(params.get('con'));
  const [rol, setRol] = useState<ReclamoRol | null>((['pedi', 'hice'] as const).find((r) => r === params.get('rol')) ?? null);
  const [motivo, setMotivo] = useState<ReclamoMotivo | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(() => {
    const f = params.get('fecha');
    return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoyISO();
  });
  const [files, setFiles] = useState<File[]>([]);
  const [resultado, setResultado] = useState<ReclamoResultado | null>(null);
  const [privada, setPrivada] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sent, setSent] = useState<{ id: string; codigo: string; seguridad: boolean } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const desdeChat = params.get('chat') === '1';
  const favor = params.get('favor');
  const prefilled = Boolean(params.get('con'));

  useEffect(() => {
    ayudaApi
      .candidatos()
      .then(setCandidatos)
      .catch((e) => {
        toastError(e);
        setCandidatos([]);
      });
  }, [toastError]);

  // Move focus to the step title so keyboard and screen-reader users know where they are.
  useEffect(() => {
    heading.current?.focus();
  }, [step, sent]);

  const persona = candidatos?.find((c) => c.id === contra) ?? null;
  const seguridad = motivo === 'inseguro';
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (candidatos ?? []).filter((c) => !q || c.display_name.toLowerCase().includes(q));
  }, [candidatos, query]);

  const validate = (s: number): Errors => {
    const e: Errors = {};
    if (s === 1) {
      if (!contra || !persona) e.who = t('ayuda.reclamo.errors.who');
      if (!rol) e.role = t('ayuda.reclamo.errors.role');
    }
    if (s === 2 && !motivo) e.motivo = t('ayuda.reclamo.errors.motivo');
    if (s === 3) {
      if (descripcion.trim().length < MIN_DESCRIPCION) e.what = t('ayuda.reclamo.errors.what');
      if (!fecha || fecha > hoyISO(1) || fecha < hoyISO(-365)) e.date = t('ayuda.reclamo.errors.date');
    }
    if (s === 4 && !resultado) e.outcome = t('ayuda.reclamo.errors.outcome');
    return e;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(TOTAL, s + 1));
  };

  const blockNow = async () => {
    if (!persona) return;
    try {
      await api.block(persona.id);
      setBlocked(true);
      refreshNetwork();
    } catch (e) {
      toastError(e);
    }
  };

  const submit = async () => {
    for (let s = 1; s < TOTAL; s++) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    setBusy(true);
    try {
      const adjuntos: string[] = [];
      for (const f of files) adjuntos.push(await subirImagenPrivada(me.id, f));
      const r = await ayudaApi.crearReclamo({
        contra: contra!,
        rol: rol!,
        motivo: motivo!,
        descripcion: descripcion.trim(),
        fecha,
        resultado: resultado!,
        privada: privada || seguridad,
        adjuntos,
        desdeChat,
        favor,
      });
      if (resultado === 'bloquear') refreshNetwork();
      setSent({ ...r, seguridad });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <AyudaShell>
        {sent.seguridad && <EmergencyBanner />}
        <section className="card p-6 text-center space-y-3">
          <CheckCircle2 size={44} className="text-success mx-auto" aria-hidden />
          <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
            {t('ayuda.reclamo.sent_title')}
          </h1>
          <p className="text-ink-2">{t('ayuda.reclamo.sent_body')}</p>
          <p className="text-2xl font-bold tracking-wide tabular-nums">{sent.codigo}</p>
          <p className="text-[15px]">{t(sent.seguridad ? 'ayuda.reclamo.sent_next_safety' : 'ayuda.reclamo.sent_next')}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Link to={`/ayuda/reclamos/${sent.id}`} className="btn-primary h-11">
              {t('ayuda.reclamo.see')}
            </Link>
            <Link to="/ayuda/mis-reclamos" className="btn-secondary h-11">
              {t('ayuda.mis_reclamos')}
            </Link>
          </div>
        </section>
      </AyudaShell>
    );

  const titles = [t('ayuda.reclamo.who'), t('ayuda.reclamo.motivo'), t('ayuda.reclamo.what'), t('ayuda.reclamo.outcome'), t('ayuda.reclamo.review')];

  return (
    <AyudaShell>
      {seguridad && <EmergencyBanner name={persona?.display_name} onBlock={blockNow} blocked={blocked} />}

      <form
        className="card p-4 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < TOTAL) next();
          else submit();
        }}
        noValidate
      >
        <div>
          <p className="text-sm text-ink-2">{t('ayuda.reclamo.title')}</p>
          <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
            {titles[step - 1]}
          </h1>
          <div
            className="mt-3 h-1.5 rounded-full bg-field overflow-hidden"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={TOTAL}
            aria-valuenow={step}
            aria-label={t('ayuda.reclamo.step', { n: step, total: TOTAL })}
          >
            <div className="h-full bg-brand-fill transition-all" style={{ width: `${(step / TOTAL) * 100}%` }} />
          </div>
          <p className="text-xs text-ink-2 mt-1">{t('ayuda.reclamo.step', { n: step, total: TOTAL })}</p>
        </div>

        {step === 1 && (
          <>
            {candidatos === null ? (
              <RowSkeleton rows={3} />
            ) : prefilled && persona ? (
              <div className="flex items-center gap-3 rounded-lg bg-field p-3">
                <Avatar id={persona.id} name={persona.display_name} url={persona.avatar_url} size={44} />
                <div>
                  <div className="font-semibold">{persona.display_name}</div>
                  {desdeChat && <div className="text-sm text-ink-2">{t('ayuda.reclamo.from_chat', { name: persona.display_name })}</div>}
                </div>
              </div>
            ) : (
              <fieldset aria-describedby={errors.who ? 'err-who' : undefined}>
                <legend className="sr-only">{t('ayuda.reclamo.who')}</legend>
                <p className="text-sm text-ink-2 mb-2">{t('ayuda.reclamo.who_hint')}</p>
                <label htmlFor="who-search" className="sr-only">
                  {t('ayuda.reclamo.who_search')}
                </label>
                <input
                  id="who-search"
                  type="search"
                  className="input h-11 mb-2"
                  placeholder={t('ayuda.reclamo.who_search')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {filtered.length === 0 && <p className="text-sm text-ink-2 py-3">{t('ayuda.reclamo.who_empty')}</p>}
                  {filtered.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 rounded-lg p-2 min-h-[48px] cursor-pointer ${contra === c.id ? 'bg-brand-soft' : 'hover:bg-hover'}`}
                    >
                      <input
                        type="radio"
                        name="contra"
                        checked={contra === c.id}
                        onChange={() => setContra(c.id)}
                        className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                      />
                      <Avatar id={c.id} name={c.display_name} url={c.avatar_url} size={36} />
                      <span className="font-medium">{c.display_name}</span>
                      {c.neighbourhood && <span className="text-sm text-ink-2 truncate">· {c.neighbourhood}</span>}
                    </label>
                  ))}
                </div>
                <FieldError id="err-who" text={errors.who} />
              </fieldset>
            )}
            {prefilled && candidatos !== null && !persona && <FieldError text={t('ayuda.errors.not_in_network')} />}

            <RadioRows
              legend={t('ayuda.reclamo.role')}
              name="rol"
              value={rol}
              onChange={setRol}
              error={errors.role}
              options={(['pedi', 'hice'] as const).map((r) => ({ value: r, label: t(`ayuda.reclamo.roles.${r}`) }))}
            />
          </>
        )}

        {step === 2 && (
          <RadioRows
            legend={t('ayuda.reclamo.motivo')}
            name="motivo"
            value={motivo}
            onChange={setMotivo}
            error={errors.motivo}
            options={MOTIVOS.map((m) => ({ value: m, label: t(`ayuda.reclamo.motivos.${m}`) }))}
          />
        )}

        {step === 3 && (
          <>
            <div>
              <label htmlFor="descripcion" className="label">
                {t('ayuda.reclamo.what')}
              </label>
              <p id="descripcion-hint" className="text-sm text-ink-2 mb-2">
                {t('ayuda.reclamo.what_hint')}
              </p>
              <textarea
                id="descripcion"
                className="input min-h-[140px]"
                maxLength={4000}
                value={descripcion}
                aria-describedby={`descripcion-hint descripcion-count${errors.what ? ' err-what' : ''}`}
                aria-invalid={Boolean(errors.what)}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <p
                id="descripcion-count"
                className={`text-xs mt-1 ${descripcion.trim().length >= MIN_DESCRIPCION ? 'text-success' : 'text-ink-2'}`}
              >
                {t('ayuda.reclamo.what_count', { count: descripcion.trim().length })}
              </p>
              <FieldError id="err-what" text={errors.what} />
            </div>
            <div>
              <label htmlFor="fecha" className="label">
                {t('ayuda.reclamo.date')}
              </label>
              <input
                id="fecha"
                type="date"
                className="input h-11 max-w-[220px]"
                value={fecha}
                min={hoyISO(-365)}
                max={hoyISO()}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? 'err-date' : undefined}
                onChange={(e) => setFecha(e.target.value)}
              />
              <FieldError id="err-date" text={errors.date} />
            </div>
            <ImagePicker files={files} onChange={setFiles} label={t('ayuda.reclamo.files')} hint={t('ayuda.reclamo.files_hint')} />
          </>
        )}

        {step === 4 && (
          <>
            <RadioRows
              legend={t('ayuda.reclamo.outcome')}
              name="resultado"
              value={resultado}
              onChange={setResultado}
              error={errors.outcome}
              options={RESULTADOS.map((r) => ({ value: r, label: t(`ayuda.reclamo.outcomes.${r}`) }))}
            />
            {resultado === 'bloquear' && persona && (
              <p className="text-sm rounded-lg bg-field p-3">{t('ayuda.reclamo.block_note', { name: persona.display_name })}</p>
            )}
            {seguridad ? (
              <p className="text-sm rounded-lg bg-brand-soft p-3">{t('ayuda.reclamo.private_forced')}</p>
            ) : (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privada}
                  onChange={(e) => setPrivada(e.target.checked)}
                  className="h-5 w-5 mt-0.5 shrink-0 accent-[rgb(var(--brand))]"
                  aria-describedby="privada-hint"
                />
                <span>
                  <span className="font-medium">{t('ayuda.reclamo.private')}</span>
                  <span id="privada-hint" className="block text-sm text-ink-2">
                    {t('ayuda.reclamo.private_hint')}
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        {step === 5 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-ink-2">{t('ayuda.reclamo.who')}</dt>
            <dd className="font-medium">{persona?.display_name}</dd>
            <dt className="text-ink-2">{t('ayuda.reclamo.role')}</dt>
            <dd>{rol && t(`ayuda.reclamo.roles.${rol}`)}</dd>
            <dt className="text-ink-2">{t('ayuda.reclamo.motivo')}</dt>
            <dd>{motivo && t(`ayuda.reclamo.motivos.${motivo}`)}</dd>
            <dt className="text-ink-2">{t('ayuda.reclamo.date')}</dt>
            <dd>{fechaCorta(fecha, i18n.language)}</dd>
            <dt className="text-ink-2">{t('ayuda.reclamo.outcome')}</dt>
            <dd>{resultado && t(`ayuda.reclamo.outcomes.${resultado}`)}</dd>
            <dt className="text-ink-2 col-span-2">{t('ayuda.reclamo.what')}</dt>
            <dd className="col-span-2 whitespace-pre-wrap break-words rounded-lg bg-field p-3">{descripcion.trim()}</dd>
            {files.length > 0 && (
              <>
                <dt className="text-ink-2">{t('ayuda.reclamo.files')}</dt>
                <dd>{files.length}</dd>
              </>
            )}
          </dl>
        )}

        <div className="flex gap-2 pt-1">
          {step > 1 && (
            <button type="button" className="btn-secondary h-11 grow sm:grow-0 sm:px-6" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              {t('ayuda.reclamo.back')}
            </button>
          )}
          <button type="submit" className="btn-primary h-11 grow" disabled={busy || candidatos === null}>
            {step < TOTAL ? t('ayuda.reclamo.next') : t('ayuda.reclamo.submit')}
          </button>
        </div>
      </form>
    </AyudaShell>
  );
}
