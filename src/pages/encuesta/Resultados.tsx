import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Play } from 'lucide-react';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { EmptyState, RowSkeleton } from '../../components/States';
import { useMe } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { supabase } from '../../lib/supabase';
import { PAISES, PREGUNTAS, ROLES, type Pais, type Pregunta, type Rol } from '../../lib/encuesta/preguntas';

interface Respuesta {
  id: string;
  rol: Rol | null;
  pais: Pais | null;
  zona: string | null;
  completa: boolean;
  contacto: string | null;
  quiere_aviso: boolean;
  quiere_charla: boolean;
  nombre: string | null;
  horario: 'manana' | 'tarde' | 'noche' | null;
  user_agent: string | null;
  con_cuenta: boolean;
  creado_en: string;
  actualizado_en: string;
}
interface ItemRow {
  respuesta_id: string;
  pregunta_id: string;
  opciones: string[];
  no_aplica: boolean;
  texto: string | null;
  audio_url: string | null;
  transcripcion: string | null;
  creado_en: string;
}

const PAIS_LABEL = Object.fromEntries(PAISES.map((x) => [x.id, x.label])) as Record<Pais, string>;
const HORARIOS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as const;
const fmtFecha = (iso: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(iso));
const fmtFechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const contestada = (i: ItemRow) => i.opciones.length > 0 || i.no_aplica;
const labelOpcion = (p: Pregunta | undefined, id: string) => p?.opciones.find((o) => o.id === id)?.label ?? id;

// Color de las marcas: un solo tono por gráfico. #8D6BE8 en oscuro (validado contra la superficie oscura).
const SERIE = 'var(--chart-serie)';
const CHART_VARS = '[--chart-serie:#6D3FD1] dark:[--chart-serie:#8D6BE8]';

async function audioUrl(path: string) {
  const { data } = await supabase.storage.from('encuesta-audios').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-field p-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-ink-2 leading-snug">{label}</div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

/** Respuestas por día: una línea de 2px con área suave, crosshair y tooltip al pasar. */
function LineaPorDia({ puntos }: { puntos: { dia: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 32, r: 12, t: 12, b: 24 };
  const max = Math.max(1, ...puntos.map((p) => p.n));
  const tick = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / tick) * tick;
  const x = (i: number) => pad.l + (puntos.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (puntos.length - 1));
  const y = (n: number) => pad.t + (H - pad.t - pad.b) * (1 - n / top);
  const line = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.n)}`).join(' ');
  const area = `${line} L${x(puntos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = Array.from({ length: top / tick + 1 }, (_, k) => k * tick);
  const labelEvery = Math.ceil(puntos.length / 6);

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    puntos.forEach((_, i) => Math.abs(x(i) - px) < Math.abs(x(best) - px) && (best = i));
    setHover(best);
  };

  if (puntos.length === 0) return <p className="text-ink-2 text-sm">Sin respuestas en este período.</p>;
  const h = hover !== null ? puntos[hover] : null;

  return (
    <div className={`relative ${CHART_VARS}`}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`Respuestas por día, máximo ${max} en un día`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--divider))" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="rgb(var(--ink-2))">{v}</text>
          </g>
        ))}
        {puntos.map((p, i) =>
          i % labelEvery === 0 || i === puntos.length - 1 ? (
            <text key={p.dia} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="rgb(var(--ink-2))">
              {fmtFecha(`${p.dia}T12:00:00`)}
            </text>
          ) : null,
        )}
        <path d={area} fill={SERIE} opacity={0.1} />
        <path d={line} fill="none" stroke={SERIE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="rgb(var(--ink-2))" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(puntos[hover].n)} r={5} fill={SERIE} stroke="rgb(var(--card))" strokeWidth={2} />
          </>
        )}
        <circle cx={x(puntos.length - 1)} cy={y(puntos[puntos.length - 1].n)} r={4} fill={SERIE} stroke="rgb(var(--card))" strokeWidth={2} />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-card border border-divider shadow-pop px-2 py-1 text-xs whitespace-nowrap"
          // Que no se corte en los bordes en pantallas angostas.
          style={{ left: `clamp(3.5rem, ${(x(hover!) / W) * 100}%, calc(100% - 3.5rem))` }}
          role="status"
        >
          <span className="text-ink-2">{fmtFecha(`${h.dia}T12:00:00`)}</span> · <strong className="tabular-nums">{h.n}</strong>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-ink-2">Ver como tabla</summary>
        <table className="mt-2 text-sm">
          <tbody>
            {puntos.map((p) => (
              <tr key={p.dia}>
                <td className="pr-4 text-ink-2">{fmtFecha(`${p.dia}T12:00:00`)}</td>
                <td className="tabular-nums text-right">{p.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Barras horizontales por opción, con cantidad y % al final. "No aplica" aparte, en gris. */
function Barras({ p, items }: { p: Pregunta; items: ItemRow[] }) {
  const base = items.filter(contestada).length;
  const filas = p.opciones.map((o) => ({ ...o, n: items.filter((i) => i.opciones.includes(o.id)).length }));
  const noAplica = items.filter((i) => i.no_aplica).length;
  const max = Math.max(1, ...filas.map((f) => f.n), noAplica);

  const Fila = ({ label, n, gris }: { label: string; n: number; gris?: boolean }) => (
    <li className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,15rem)_1fr] gap-x-3 gap-y-1 items-center" title={`${label}: ${n} (${pct(n, base)}%)`}>
      <span className={`text-sm ${gris ? 'text-ink-2' : ''}`}>{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="grow min-w-0">
          <span
            className="block h-4 rounded-r-[4px]"
            style={{ width: `${(n / max) * 100}%`, minWidth: n ? 2 : 0, background: gris ? 'rgb(var(--ink-2) / 0.55)' : SERIE }}
          />
        </span>
        <span className="text-sm tabular-nums whitespace-nowrap w-[4.5rem] shrink-0">
          {n} <span className="text-ink-2">· {pct(n, base)}%</span>
        </span>
      </span>
    </li>
  );

  return (
    <div className={CHART_VARS}>
      <p className="text-xs text-ink-2 mb-2">
        {base} {base === 1 ? 'persona contestó' : 'personas contestaron'}
        {p.tipo === 'multiple' ? ' · se podían elegir varias, por eso los % suman más de 100' : ''}
      </p>
      <ul className="space-y-2">
        {filas.map((f) => (
          <Fila key={f.id} label={`${f.emoji} ${f.label}`} n={f.n} />
        ))}
      </ul>
      <ul className="mt-3 pt-3 border-t border-divider">
        <Fila label="No aplica" n={noAplica} gris />
      </ul>
    </div>
  );
}

function Audio({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  if (src) return <audio controls autoPlay src={src} className="w-full max-w-sm" aria-label="Audio de la respuesta" />;
  return (
    <button className="btn-secondary h-8 text-sm" onClick={async () => setSrc(await audioUrl(path))}>
      <Play size={14} aria-hidden /> Escuchar audio
    </button>
  );
}

function Comentarios({ p, items }: { p: Pregunta; items: ItemRow[] }) {
  const [q, setQ] = useState('');
  const conTexto = items
    .filter((i) => i.texto || i.audio_url || i.transcripcion)
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  const filtrados = conTexto.filter((i) => {
    const s = q.trim().toLowerCase();
    return !s || `${i.texto ?? ''} ${i.transcripcion ?? ''}`.toLowerCase().includes(s);
  });
  if (conTexto.length === 0) return null;
  return (
    <details className="mt-4">
      <summary className="cursor-pointer font-medium">
        Comentarios y audios ({conTexto.length})
      </summary>
      <label className="sr-only" htmlFor={`buscar-${p.id}`}>Buscar en comentarios</label>
      <input
        id={`buscar-${p.id}`}
        type="search"
        className="input h-10 mt-2"
        placeholder="Buscar en comentarios y transcripciones"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="mt-2 space-y-2 max-h-[420px] overflow-y-auto">
        {filtrados.map((i) => (
          <li key={i.respuesta_id} className="rounded-lg bg-field p-3 space-y-1.5">
            <div className="text-xs text-ink-2">{fmtFechaHora(i.creado_en)}</div>
            {i.texto && <p className="text-[15px] whitespace-pre-wrap break-words">{i.texto}</p>}
            {i.audio_url && <Audio path={i.audio_url} />}
            {i.transcripcion && (
              <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">
                <span className="font-semibold">Transcripción:</span> {i.transcripcion}
              </p>
            )}
          </li>
        ))}
        {filtrados.length === 0 && <li className="text-sm text-ink-2">Nada coincide con la búsqueda.</li>}
      </ul>
    </details>
  );
}

function celdaPregunta(p: Pregunta, i: ItemRow | undefined) {
  if (!i) return '';
  if (i.no_aplica) return 'No aplica';
  return i.opciones.map((o) => labelOpcion(p, o)).join('; ');
}

function exportarCSV(respuestas: Respuesta[], items: ItemRow[]) {
  const porResp = new Map<string, Map<string, ItemRow>>();
  for (const i of items) {
    if (!porResp.has(i.respuesta_id)) porResp.set(i.respuesta_id, new Map());
    porResp.get(i.respuesta_id)!.set(i.pregunta_id, i);
  }
  const header = ['id', 'fecha', 'rol', 'pais', 'zona', 'completa', 'con_cuenta', 'quiere_aviso', 'quiere_charla', 'nombre', 'contacto', 'horario'];
  for (const p of PREGUNTAS) header.push(p.id, `${p.id}_texto`, `${p.id}_audio`, `${p.id}_transcripcion`);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = respuestas.map((r) => {
    const m = porResp.get(r.id);
    const cols: unknown[] = [
      r.id, r.creado_en, r.rol ? ROLES[r.rol] : '', r.pais ? PAIS_LABEL[r.pais] : '', r.zona, r.completa ? 'sí' : 'no', r.con_cuenta ? 'sí' : 'no',
      r.quiere_aviso ? 'sí' : 'no', r.quiere_charla ? 'sí' : 'no', r.nombre, r.contacto, r.horario ? HORARIOS[r.horario] : '',
    ];
    for (const p of PREGUNTAS) {
      const i = m?.get(p.id);
      cols.push(celdaPregunta(p, i), i?.texto, i?.audio_url, i?.transcripcion);
    }
    return cols.map(esc).join(',');
  });
  // BOM para que Excel abra bien los acentos.
  const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `encuesta-che-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function DetalleRespuesta({ r, items, onClose }: { r: Respuesta; items: ItemRow[]; onClose: () => void }) {
  const mios = new Map(items.filter((i) => i.respuesta_id === r.id).map((i) => [i.pregunta_id, i]));
  return (
    <Modal open wide onClose={onClose} title={`Respuesta del ${fmtFechaHora(r.creado_en)}`}>
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mb-4">
        <dt className="text-ink-2">Rol</dt>
        <dd>{r.rol ? ROLES[r.rol] : '—'}</dd>
        <dt className="text-ink-2">Dónde vive</dt>
        <dd>{[r.pais && PAIS_LABEL[r.pais], r.zona].filter(Boolean).join(' · ') || '—'}</dd>
        <dt className="text-ink-2">Completa</dt>
        <dd>{r.completa ? 'Sí' : 'No'}</dd>
        <dt className="text-ink-2">Con cuenta de Che</dt>
        <dd>{r.con_cuenta ? 'Sí' : 'No'}</dd>
        {r.nombre && (
          <>
            <dt className="text-ink-2">Nombre</dt>
            <dd>{r.nombre}</dd>
          </>
        )}
        {r.contacto && (
          <>
            <dt className="text-ink-2">Contacto</dt>
            <dd className="break-all">{r.contacto}</dd>
          </>
        )}
        {(r.quiere_aviso || r.quiere_charla) && (
          <>
            <dt className="text-ink-2">Pidió</dt>
            <dd>
              {[r.quiere_aviso && 'Aviso', r.quiere_charla && `Charla${r.horario ? ` (${HORARIOS[r.horario]})` : ''}`].filter(Boolean).join(' · ')}
            </dd>
          </>
        )}
      </dl>
      <ol className="space-y-3">
        {PREGUNTAS.map((p, n) => {
          const i = mios.get(p.id);
          return (
            <li key={p.id} className="rounded-lg bg-field p-3 space-y-1">
              <div className="text-sm font-semibold">
                {n + 1}. {p.titulo}
              </div>
              <div className="text-[15px]">{i ? celdaPregunta(p, i) || <span className="text-ink-2">Sin opciones</span> : <span className="text-ink-2">Salteada</span>}</div>
              {i?.texto && <p className="text-[15px] whitespace-pre-wrap break-words">"{i.texto}"</p>}
              {i?.audio_url && <Audio path={i.audio_url} />}
              {i?.transcripcion && <p className="text-sm text-ink-2 whitespace-pre-wrap">Transcripción: {i.transcripcion}</p>}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

/** Personas que se anotaron para una charla de 15 minutos. */
function Charlas({ respuestas, onVer }: { respuestas: Respuesta[]; onVer: (r: Respuesta) => void }) {
  const lista = respuestas.filter((r) => r.quiere_charla);
  if (lista.length === 0) return null;
  return (
    <section className="card p-2 sm:p-4 overflow-x-auto">
      <h2 className="font-semibold mb-2 px-2 sm:px-0">Quieren una charla ({lista.length})</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-2 border-b border-divider">
            <th className="py-2 pr-3 font-medium">Nombre</th>
            <th className="py-2 pr-3 font-medium">Contacto</th>
            <th className="py-2 pr-3 font-medium">Horario</th>
            <th className="py-2 pr-3 font-medium">Rol</th>
            <th className="py-2 font-medium"><span className="sr-only">Respuestas</span></th>
          </tr>
        </thead>
        <tbody>
          {lista.map((r) => (
            <tr key={r.id} className="border-b border-divider last:border-0">
              <td className="py-2 pr-3">{r.nombre}</td>
              <td className="py-2 pr-3 break-all">{r.contacto}</td>
              <td className="py-2 pr-3">{r.horario ? HORARIOS[r.horario] : '—'}</td>
              <td className="py-2 pr-3">{r.rol ? ROLES[r.rol] : '—'}</td>
              <td className="py-2 text-right">
                <button className="link whitespace-nowrap" onClick={() => onVer(r)}>Ver respuestas</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** /encuesta/resultados — solo admins (la RPC también lo verifica). */
export default function Resultados() {
  const { priv } = useMe();
  const { toastError } = useUI();
  const [rol, setRol] = useState<Rol | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [charla, setCharla] = useState(false);
  const [pais, setPais] = useState<Pais | ''>('');
  const [data, setData] = useState<{ respuestas: Respuesta[]; items: ItemRow[] } | null>(null);
  const [vista, setVista] = useState<'preguntas' | 'respuestas'>('preguntas');
  const [abierta, setAbierta] = useState<Respuesta | null>(null);

  const load = useCallback(async () => {
    setData(null);
    const { data: d, error } = await supabase.rpc('admin_encuesta', {
      p_rol: rol || null,
      p_desde: desde || null,
      p_hasta: hasta || null,
      p_charla: charla ? true : null,
      p_pais: pais || null,
    });
    if (error) {
      toastError(error);
      setData({ respuestas: [], items: [] });
    } else setData(d as { respuestas: Respuesta[]; items: ItemRow[] });
  }, [rol, desde, hasta, charla, pais, toastError]);

  useEffect(() => {
    if (priv.is_admin) load();
  }, [priv.is_admin, load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const { respuestas, items } = data;
    const porDia = new Map<string, number>();
    for (const r of respuestas) porDia.set(diaLocal(r.creado_en), (porDia.get(diaLocal(r.creado_en)) ?? 0) + 1);
    // Días sin respuestas cuentan como 0, para que la línea no mienta.
    const dias = [...porDia.keys()].sort();
    const puntos: { dia: string; n: number }[] = [];
    if (dias.length) {
      for (let d = new Date(`${dias[0]}T12:00:00`); diaLocal(d.toISOString()) <= dias[dias.length - 1]; d.setDate(d.getDate() + 1)) {
        const k = diaLocal(d.toISOString());
        puntos.push({ dia: k, n: porDia.get(k) ?? 0 });
      }
    }
    const answered = new Map<string, number>();
    for (const i of items) if (contestada(i) || i.texto || i.audio_url) answered.set(i.respuesta_id, (answered.get(i.respuesta_id) ?? 0) + 1);
    return {
      total: respuestas.length,
      completas: respuestas.filter((r) => r.completa).length,
      paises: Object.fromEntries(PAISES.map((x) => [x.id, respuestas.filter((r) => r.pais === x.id).length])) as Record<Pais, number>,
      roles: Object.fromEntries((Object.keys(ROLES) as Rol[]).map((k) => [k, respuestas.filter((r) => r.rol === k).length])) as Record<Rol, number>,
      puntos,
      answered,
    };
  }, [data]);

  if (!priv.is_admin)
    return (
      <Layout variant="full">
        <EmptyState title="Esta página es solo para el equipo de Che." />
      </Layout>
    );

  return (
    <Layout variant="full">
      <Link to="/admin" className="btn-ghost -ml-2 self-start">
        <ArrowLeft size={18} aria-hidden /> Moderación
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h1 className="text-2xl font-bold">Resultados de la encuesta</h1>
        <button className="btn-secondary" disabled={!data?.respuestas.length} onClick={() => data && exportarCSV(data.respuestas, data.items)}>
          <Download size={16} aria-hidden /> Exportar CSV
        </button>
      </div>

      {/* Filtros: una fila arriba de todo; todo se recalcula. */}
      <section className="card p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <div>
          <label className="label" htmlFor="r-rol">Rol (P1)</label>
          <select id="r-rol" className="input h-10" value={rol} onChange={(e) => setRol(e.target.value as Rol | '')}>
            <option value="">Todos</option>
            {(Object.keys(ROLES) as Rol[]).map((k) => (
              <option key={k} value={k}>{ROLES[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-pais">País</label>
          <select id="r-pais" className="input h-10" value={pais} onChange={(e) => setPais(e.target.value as Pais | '')}>
            <option value="">Todos</option>
            {PAISES.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-desde">Desde</label>
          <input id="r-desde" type="date" className="input h-10" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-hasta">Hasta</label>
          <input id="r-hasta" type="date" className="input h-10" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 h-10 cursor-pointer text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={charla} onChange={(e) => setCharla(e.target.checked)} />
          Quiere charla
        </label>
      </section>

      {!data || !stats ? (
        <div className="card p-4"><RowSkeleton rows={4} /></div>
      ) : (
        <>
          <section className="card p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Tile label="Respuestas" value={stats.total} />
              <Tile label="Completas" value={`${pct(stats.completas, stats.total)}%`} sub={`${stats.completas} de ${stats.total}`} />
              <Tile label="Contratan" value={stats.roles.contrato} />
              <Tile label="Trabajan" value={stats.roles.trabajo} />
              <Tile label="Las dos cosas" value={stats.roles.ambos} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PAISES.map((x) => (
                <Tile key={x.id} label={x.label} value={stats.paises[x.id]} sub={`${pct(stats.paises[x.id], stats.total)}%`} />
              ))}
            </div>
            <div>
              <h2 className="font-semibold mb-2">Respuestas por día</h2>
              <LineaPorDia puntos={stats.puntos} />
            </div>
          </section>

          <Charlas respuestas={data.respuestas} onVer={setAbierta} />

          <div className="flex gap-2" role="tablist" aria-label="Vista">
            {(['preguntas', 'respuestas'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? 'chip-on' : 'chip-off'} onClick={() => setVista(v)}>
                {v === 'preguntas' ? 'Por pregunta' : 'Respuesta por respuesta'}
              </button>
            ))}
          </div>

          {vista === 'preguntas' ? (
            PREGUNTAS.map((p, n) => {
              const its = data.items.filter((i) => i.pregunta_id === p.id);
              return (
                <section key={p.id} className="card p-4">
                  <h2 className="font-semibold mb-2">
                    {n + 1}. {p.titulo}
                  </h2>
                  <Barras p={p} items={its} />
                  <Comentarios p={p} items={its} />
                </section>
              );
            })
          ) : (
            <section className="card p-2 sm:p-4 overflow-x-auto">
              {data.respuestas.length === 0 ? (
                <p className="text-ink-2 p-2">Sin respuestas con estos filtros.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-2 border-b border-divider">
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Rol</th>
                      <th className="py-2 pr-3 font-medium">Completa</th>
                      <th className="py-2 pr-3 font-medium text-right">Contestó</th>
                      <th className="py-2 font-medium">Contacto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.respuestas.map((r) => (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        className="border-b border-divider last:border-0 hover:bg-hover cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        onClick={() => setAbierta(r)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setAbierta(r))}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtFechaHora(r.creado_en)}</td>
                        <td className="py-2 pr-3">{r.rol ? ROLES[r.rol] : '—'}</td>
                        <td className="py-2 pr-3">{r.completa ? 'Sí' : 'No'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{stats.answered.get(r.id) ?? 0} / {PREGUNTAS.length}</td>
                        <td className="py-2 truncate max-w-[12rem]">{r.contacto ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          {abierta && <DetalleRespuesta r={abierta} items={data.items} onClose={() => setAbierta(null)} />}
        </>
      )}
    </Layout>
  );
}
