import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { EmptyState, RowSkeleton } from '../components/States';
import { EstadoTag } from '../components/ayuda/ui';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { ESTADOS, fechaCorta, urlsFirmadas, type ReclamoEstado } from '../lib/ayuda';
import { ReclamoBody, loadReclamo, type ReclamoData } from './ayuda/ReclamoDetalle';

type Tipo = 'reclamo' | 'tecnico' | 'sugerencia';
const FB_ESTADOS = ['nuevo', 'visto', 'resuelto'] as const;
const FLAG = 3;

interface Fila {
  tipo: Tipo;
  id: string;
  codigo: string | null;
  subtipo: string;
  estado: string;
  resumen: string | null;
  autor_id: string | null;
  autor_nombre: string | null;
  contra_id: string | null;
  contra_nombre: string | null;
  contra_confirmados_90d: number | null;
  creado_en: string;
}

interface Feedback {
  id: string;
  tipo: string;
  puntaje: number | null;
  texto: string | null;
  intentaba: string | null;
  url_pagina: string | null;
  navegador: string | null;
  captura_path: string | null;
  permite_contacto: boolean;
  estado: (typeof FB_ESTADOS)[number];
  creado_en: string;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function FlagTag({ n }: { n: number | null }) {
  const { t } = useTranslation();
  if (!n || n < FLAG) return null;
  return (
    <span className="tag bg-danger/15 text-danger gap-1">
      <AlertTriangle size={12} aria-hidden /> {t('ayuda.admin.flag', { count: n })}
    </span>
  );
}

function ReclamoAdmin({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const [data, setData] = useState<ReclamoData | null>(null);
  const [estado, setEstado] = useState<ReclamoEstado>('recibido');
  const [confirmado, setConfirmado] = useState(false);
  const [texto, setTexto] = useState('');
  const [para, setPara] = useState<'interno' | 'autor' | 'contra' | 'ambos'>('interno');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await loadReclamo(id);
    setData(d);
    if (d) {
      setEstado(d.r.estado);
      setConfirmado(Boolean(d.r.confirmado));
    }
  }, [id]);
  useEffect(() => {
    load().catch(toastError);
  }, [load, toastError]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast(t('ayuda.admin.saved'));
      await load();
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <RowSkeleton rows={4} />;
  const sinAviso = data.r.respuesta_limite === null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoTag estado={data.r.estado} />
        {data.r.desde_chat && <span className="tag bg-field text-ink-2">chat</span>}
        <Link className="link text-sm" to={`/perfil/${data.r.autor_id}`}>{data.r.autor_nombre}</Link>
        <span className="text-sm text-ink-2">{t('ayuda.admin.against')}</span>
        <Link className="link text-sm" to={`/perfil/${data.r.contra_id}`}>{data.r.contra_nombre}</Link>
      </div>

      <ReclamoBody data={data} meId={me.id} />

      <section className="card p-4 space-y-3">
        <h3 className="font-semibold">{t('ayuda.admin.change_status')}</h3>
        <label className="sr-only" htmlFor="adm-estado">{t('ayuda.admin.status')}</label>
        <select id="adm-estado" className="input h-11" value={estado} onChange={(e) => setEstado(e.target.value as ReclamoEstado)}>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>{t(`ayuda.estados.${s}`)}</option>
          ))}
        </select>
        <label className="flex items-start gap-3 cursor-pointer text-[15px]">
          <input type="checkbox" className="h-5 w-5 mt-0.5 shrink-0 accent-[rgb(var(--brand))]" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
          {t('ayuda.admin.confirmed')}
        </label>
        <button
          className="btn-primary h-10 w-full"
          disabled={busy}
          onClick={() => run(() => rpc('admin_reclamo_estado', { p_reclamo: id, p_estado: estado, p_confirmado: confirmado }))}
        >
          {t('ayuda.admin.save')}
        </button>
      </section>

      <section className="card p-4 space-y-3">
        <h3 className="font-semibold">{t('ayuda.admin.note')}</h3>
        <fieldset>
          <legend className="label">{t('ayuda.admin.note_to')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['interno', 'autor', 'contra', 'ambos'] as const).map((p) => (
              <label key={p} className={`${para === p ? 'chip-on' : 'chip-off'} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand`}>
                <input
                  type="radio"
                  name="para"
                  className="sr-only"
                  checked={para === p}
                  disabled={sinAviso && (p === 'contra' || p === 'ambos')}
                  onChange={() => setPara(p)}
                />
                {t(`ayuda.admin.note_tos.${p}`)}
              </label>
            ))}
          </div>
          {sinAviso && <p className="text-xs text-ink-2 mt-1">{t('ayuda.errors.contra_sin_aviso')}</p>}
        </fieldset>
        <label className="sr-only" htmlFor="adm-texto">{t('ayuda.admin.note')}</label>
        <textarea id="adm-texto" className="input min-h-[90px]" maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button
          className="btn-secondary h-10 w-full"
          disabled={busy || texto.trim().length < 2}
          onClick={() =>
            run(async () => {
              await rpc('admin_reclamo_mensaje', { p_reclamo: id, p_texto: texto.trim(), p_para: para });
              setTexto('');
            })
          }
        >
          {t('ayuda.detalle.send')}
        </button>
      </section>
    </div>
  );
}

function FeedbackAdmin({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { toastError } = useUI();
  const [f, setF] = useState<Feedback | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  useEffect(() => {
    rpc<Feedback[]>('admin_ver_feedback', { p_id: id })
      .then(async (rows) => {
        const row = rows[0] ?? null;
        setF(row);
        if (row?.captura_path) setShot((await urlsFirmadas([row.captura_path]))[row.captura_path] ?? null);
      })
      .catch(toastError);
  }, [id, toastError]);

  if (!f) return <RowSkeleton rows={3} />;
  const setEstado = async (estado: string) => {
    try {
      await rpc('admin_feedback_estado', { p_id: id, p_estado: estado });
      setF({ ...f, estado: estado as Feedback['estado'] });
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="space-y-3 text-[15px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-2">{t('ayuda.admin.type')}</dt>
        <dd>{f.tipo}{f.puntaje ? ` · ${f.puntaje}/5` : ''}</dd>
        <dt className="text-ink-2">{t('ayuda.detalle.date')}</dt>
        <dd>{fechaCorta(f.creado_en, i18n.language)}</dd>
        {f.url_pagina && (<><dt className="text-ink-2">{t('ayuda.admin.page')}</dt><dd className="break-all">{f.url_pagina}</dd></>)}
        {f.navegador && (<><dt className="text-ink-2">{t('ayuda.admin.browser')}</dt><dd className="text-sm break-words">{f.navegador}</dd></>)}
        <dt className="text-ink-2">{t('ayuda.admin.can_contact')}</dt>
        <dd>{f.permite_contacto ? t('common.yes') : t('common.no')}</dd>
      </dl>
      {f.intentaba && (
        <div>
          <p className="label">{t('ayuda.reporte.trying')}</p>
          <p className="rounded-lg bg-field p-3 whitespace-pre-wrap break-words">{f.intentaba}</p>
        </div>
      )}
      {f.texto && <p className="rounded-lg bg-field p-3 whitespace-pre-wrap break-words">{f.texto}</p>}
      {shot && (
        <a href={shot} target="_blank" rel="noreferrer">
          <img src={shot} alt={t('ayuda.admin.screenshot')} className="max-h-64 rounded-lg border border-divider" />
        </a>
      )}
      <label className="label" htmlFor="fb-estado">{t('ayuda.admin.status')}</label>
      <select id="fb-estado" className="input h-11" value={f.estado} onChange={(e) => setEstado(e.target.value)}>
        {FB_ESTADOS.map((s) => (
          <option key={s} value={s}>{t(`ayuda.admin.fb_estados.${s}`)}</option>
        ))}
      </select>
    </div>
  );
}

/** /admin/ayuda — claims, bug reports and suggestions (admins only; the RPCs check it too). */
export default function AdminAyuda() {
  const { t, i18n } = useTranslation();
  const { priv } = useMe();
  const { toastError } = useUI();
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rows, setRows] = useState<Fila[] | null>(null);
  const [open, setOpen] = useState<Fila | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        await rpc<Fila[]>('admin_ayuda_lista', {
          p_tipo: tipo || null,
          p_estado: estado || null,
          p_desde: desde || null,
          p_hasta: hasta || null,
        }),
      );
    } catch (e) {
      toastError(e);
      setRows([]);
    }
  }, [tipo, estado, desde, hasta, toastError]);

  useEffect(() => {
    if (priv.is_admin) load();
  }, [priv.is_admin, load]);

  if (!priv.is_admin)
    return (
      <Layout variant="full">
        <EmptyState title={t('admin.forbidden')} />
      </Layout>
    );

  const estados: string[] = tipo === 'reclamo' ? ESTADOS : tipo ? [...FB_ESTADOS] : [...ESTADOS, ...FB_ESTADOS];
  const estadoLabel = (r: Fila) =>
    r.tipo === 'reclamo' ? <EstadoTag estado={r.estado as ReclamoEstado} /> : <span className="tag bg-field text-ink-2">{t(`ayuda.admin.fb_estados.${r.estado}`)}</span>;

  return (
    <Layout variant="full">
      <Link to="/admin" className="btn-ghost -ml-2 self-start">
        <ArrowLeft size={18} aria-hidden /> {t('admin.title')}
      </Link>
      <h1 className="text-2xl font-bold px-1">{t('ayuda.admin.title')}</h1>

      <section className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="label" htmlFor="f-tipo">{t('ayuda.admin.type')}</label>
          <select id="f-tipo" className="input h-10" value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo | ''); setEstado(''); }}>
            <option value="">{t('ayuda.admin.types.all')}</option>
            {(['reclamo', 'tecnico', 'sugerencia'] as const).map((x) => (
              <option key={x} value={x}>{t(`ayuda.admin.types.${x}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-estado">{t('ayuda.admin.status')}</label>
          <select id="f-estado" className="input h-10" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">{t('ayuda.admin.any')}</option>
            {estados.map((s) => (
              <option key={s} value={s}>{(ESTADOS as string[]).includes(s) ? t(`ayuda.estados.${s}`) : t(`ayuda.admin.fb_estados.${s}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-desde">{t('ayuda.admin.from')}</label>
          <input id="f-desde" type="date" className="input h-10" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-hasta">{t('ayuda.admin.to')}</label>
          <input id="f-hasta" type="date" className="input h-10" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </section>

      <section className="card p-2 sm:p-4">
        {rows === null ? (
          <RowSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <p className="text-ink-2 p-2">{t('ayuda.admin.empty')}</p>
        ) : (
          <ul className="divide-y divide-divider">
            {rows.map((r) => (
              <li key={`${r.tipo}-${r.id}`}>
                <button className="w-full text-left py-3 px-2 rounded-lg hover:bg-hover space-y-1" onClick={() => setOpen(r)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag bg-field text-ink-2">{t(`ayuda.admin.types.${r.tipo}`)}</span>
                    {r.codigo && <span className="font-semibold tabular-nums">{r.codigo}</span>}
                    {estadoLabel(r)}
                    <FlagTag n={r.contra_confirmados_90d} />
                    <span className="text-xs text-ink-2 ml-auto">{fechaCorta(r.creado_en, i18n.language)}</span>
                  </div>
                  <div className="text-sm">
                    {r.tipo === 'reclamo' ? (
                      <>
                        {r.autor_nombre} <span className="text-ink-2">{t('ayuda.admin.against')}</span> {r.contra_nombre} ·{' '}
                        <span className="text-ink-2">{t(`ayuda.reclamo.motivos.${r.subtipo}`)}</span>
                      </>
                    ) : (
                      <>{r.autor_nombre ?? '—'}</>
                    )}
                  </div>
                  {r.resumen && <p className="text-sm text-ink-2 line-clamp-2">{r.resumen}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <Modal open wide onClose={() => setOpen(null)} title={open.codigo ?? t(`ayuda.admin.types.${open.tipo}`)}>
          {open.tipo === 'reclamo' ? <ReclamoAdmin id={open.id} onChanged={load} /> : <FeedbackAdmin id={open.id} onChanged={load} />}
        </Modal>
      )}
    </Layout>
  );
}
