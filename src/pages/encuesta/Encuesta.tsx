import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PREGUNTAS, PAISES, MAX_TEXTO, MAX_ZONA, labelDe, maxOpciones, type Pais, type Pregunta } from '../../lib/encuesta/preguntas';
import {
  completar,
  estado,
  guardar,
  hayEncuestaEnCurso,
  itemTieneAlgo,
  itemVacio,
  mensajeError,
  olvidarToken,
  token,
  type Item,
} from '../../lib/encuesta/api';
import GrabadorAudio from './GrabadorAudio';
import ContactoFinal from './ContactoFinal';

const TOTAL = PREGUNTAS.length;
type Fase = 'cargando' | 'intro' | 'pregunta' | 'final';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-page flex flex-col">
      <header className="h-14 bg-card border-b border-divider flex items-center px-4">
        <Link to="/" className="text-xl font-bold text-brand">che</Link>
      </header>
      <main className="grow w-full max-w-[560px] mx-auto px-4 py-5 flex flex-col">{children}</main>
    </div>
  );
}

/** "¿Dónde vivís?" + "Ciudad o barrio": arriba de P1, en la misma pantalla. */
function Ubicacion({
  pais,
  zona,
  onPais,
  onZona,
  error,
}: {
  pais: Pais | null;
  zona: string;
  onPais: (p: Pais) => void;
  onZona: (z: string) => void;
  error: string | null;
}) {
  const id = useId();
  return (
    <div className="mb-8 space-y-4">
      <fieldset aria-describedby={error ? `${id}-err` : undefined}>
        <legend className="text-[22px] leading-snug font-semibold mb-3">¿Dónde vivís?</legend>
        <div className="grid grid-cols-3 gap-2">
          {PAISES.map((x) => (
            <label
              key={x.id}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 min-h-[76px] px-2 py-2 text-[15px] text-center cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                pais === x.id ? 'border-brand bg-brand-soft font-semibold' : 'border-divider bg-card hover:bg-hover'
              }`}
            >
              <input type="radio" name="pais" className="sr-only" checked={pais === x.id} onChange={() => onPais(x.id)} />
              <span className="text-2xl" aria-hidden>{x.emoji}</span>
              {x.label}
            </label>
          ))}
        </div>
        {error && <p id={`${id}-err`} className="text-danger text-sm mt-2" role="alert">{error}</p>}
      </fieldset>
      <div>
        <label htmlFor={`${id}-zona`} className="block text-[17px] font-semibold mb-1">
          Ciudad o barrio <span className="text-ink-2 font-normal text-[15px]">(opcional)</span>
        </label>
        <input
          id={`${id}-zona`}
          className="input h-12 text-[16px]"
          maxLength={MAX_ZONA}
          autoComplete="address-level2"
          value={zona}
          onChange={(e) => onZona(e.target.value)}
        />
      </div>
    </div>
  );
}

function PreguntaPantalla({
  p,
  item,
  onChange,
  respuestaId,
  asegurarRespuesta,
  pais,
}: {
  p: Pregunta;
  item: Item;
  onChange: (i: Item) => void;
  respuestaId: string | null;
  asegurarRespuesta: () => Promise<string>;
  pais: Pais | null;
}) {
  const max = maxOpciones(p);
  const unica = p.tipo === 'unica';
  const textoId = useId();
  const tope = !unica && item.opciones.length >= max;

  const toggle = (id: string) => {
    const on = item.opciones.includes(id);
    let opciones: string[];
    if (unica) opciones = on ? [] : [id];
    else if (on) opciones = item.opciones.filter((x) => x !== id);
    else if (item.opciones.length < max) opciones = [...item.opciones, id];
    else return;
    onChange({ ...item, opciones, no_aplica: false });
  };

  return (
    <>
      <fieldset>
        <legend className="text-[22px] leading-snug font-semibold mb-1">{p.titulo}</legend>
        <p className="text-[15px] text-ink-2 mb-4">
          {unica ? 'Elegí una.' : p.max ? `Elegí hasta ${p.max}.` : 'Podés elegir varias.'}
        </p>
        <div className="space-y-2.5">
          {p.opciones.map((o) => {
            const on = item.opciones.includes(o.id);
            const disabled = !on && tope;
            return (
              <label
                key={o.id}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 min-h-[60px] py-3 text-[17px] cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                  on ? 'border-brand bg-brand-soft' : disabled ? 'border-divider bg-card opacity-50 cursor-not-allowed' : 'border-divider bg-card hover:bg-hover'
                }`}
              >
                <input
                  type={unica ? 'radio' : 'checkbox'}
                  name={p.id}
                  className="sr-only"
                  checked={on}
                  disabled={disabled}
                  onChange={() => toggle(o.id)}
                  // Radios: clicking the selected one again unselects it.
                  onClick={() => unica && on && toggle(o.id)}
                />
                <span className="text-2xl shrink-0" aria-hidden>{o.emoji}</span>
                <span className="grow">{labelDe(o, pais)}</span>
                <span
                  className={`h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? 'bg-brand-fill border-brand-fill text-white' : 'border-divider'}`}
                  aria-hidden
                >
                  {on && <Check size={16} strokeWidth={3} />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        aria-pressed={item.no_aplica}
        onClick={() => onChange({ ...item, no_aplica: !item.no_aplica, opciones: [] })}
        className={`mt-3 w-full rounded-xl border-2 px-4 min-h-[52px] text-[16px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          item.no_aplica ? 'border-ink-2 bg-field text-ink' : 'border-dashed border-divider text-ink-2 hover:bg-hover'
        }`}
      >
        {item.no_aplica && <Check size={16} className="inline mr-1 -mt-0.5" aria-hidden />}
        No aplica para mí
      </button>

      <div className="mt-6 space-y-2">
        <label htmlFor={textoId} className="block text-[17px] font-semibold">
          {p.textoTitulo ?? '¿Querés contar algo más?'} <span className="text-ink-2 font-normal text-[15px]">(opcional)</span>
        </label>
        <textarea
          id={textoId}
          className="input min-h-[96px] text-[16px]"
          maxLength={MAX_TEXTO}
          value={item.texto}
          onChange={(e) => onChange({ ...item, texto: e.target.value })}
        />
        <p className="text-xs text-ink-2 text-right tabular-nums">{item.texto.length} / {MAX_TEXTO}</p>
        <GrabadorAudio
          audioPath={item.audio_url}
          transcripcion={item.transcripcion}
          respuestaId={respuestaId}
          asegurarRespuesta={asegurarRespuesta}
          onChange={(a) => onChange({ ...item, ...a })}
          pais={pais}
        />
      </div>
    </>
  );
}

/** /encuesta — pública. Una pregunta por pantalla; guarda en cada paso. */
export default function Encuesta() {
  const { profile } = useAuth();
  const [fase, setFase] = useState<Fase>('cargando');
  const [paso, setPaso] = useState(0);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [respuestaId, setRespuestaId] = useState<string | null>(null);
  const [retomar, setRetomar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trampa, setTrampa] = useState('');
  const [pais, setPais] = useState<Pais | null>(null);
  const [zona, setZona] = useState('');
  const [errorPais, setErrorPais] = useState<string | null>(null);
  const tok = useRef<string>('');
  const titulo = useRef<HTMLDivElement>(null);

  // Retomar una encuesta a medias en este dispositivo.
  useEffect(() => {
    const enCurso = hayEncuestaEnCurso();
    tok.current = token();
    if (!enCurso) return setFase('intro');
    estado(tok.current)
      .then((e) => {
        if (e?.completa) {
          olvidarToken();
          tok.current = token();
        } else if (e) {
          setRespuestaId(e.respuesta_id);
          setPais(e.pais);
          setZona(e.zona ?? '');
          setItems(Object.fromEntries(e.items.map(({ pregunta_id, ...i }) => [pregunta_id, i])));
          const primeraSin = PREGUNTAS.findIndex((p) => !e.items.some((i) => i.pregunta_id === p.id));
          setPaso(primeraSin === -1 ? TOTAL - 1 : primeraSin);
          setRetomar(true);
          // Si ya respondió al menos una pregunta, no repetimos la bienvenida.
          if (e.items.length > 0) return setFase('pregunta');
        }
        setFase('intro');
      })
      .catch(() => setFase('intro'));
  }, []);

  useEffect(() => {
    titulo.current?.focus();
  }, [paso, fase]);

  const p = PREGUNTAS[paso];
  const item = items[p.id] ?? itemVacio();
  const setItem = (i: Item) => setItems((all) => ({ ...all, [p.id]: i }));

  /** Crea la respuesta si todavía no existe (hace falta para subir un audio). */
  const asegurarRespuesta = async () => {
    if (respuestaId) return respuestaId;
    const id = await guardar(tok.current, p.id, item, trampa, ubicacion());
    setRespuestaId(id);
    return id;
  };

  const terminar = async () => {
    setFase('final');
    try {
      if (respuestaId || Object.values(items).some(itemTieneAlgo)) await completar(tok.current, trampa);
    } catch {
      /* el contacto se puede reintentar abajo */
    }
    // La próxima visita empieza una respuesta nueva (el contacto usa tok.current).
    olvidarToken();
  };

  /** País y zona viajan con P1 (y con cualquier guardado mientras estamos en P1). */
  const ubicacion = () => (paso === 0 && pais ? { pais, zona } : undefined);

  const avanzar = async (guardarEste: boolean) => {
    setError(null);
    // En P1, "¿Dónde vivís?" es obligatorio para avanzar (también para saltear P1).
    if (paso === 0 && !pais) {
      setErrorPais('Elegí dónde vivís para seguir.');
      return;
    }
    // En P1 siempre se guarda, aunque saltee la pregunta, para registrar el país.
    if ((guardarEste && itemTieneAlgo(item)) || paso === 0) {
      setBusy(true);
      try {
        setRespuestaId(await guardar(tok.current, p.id, guardarEste ? item : itemVacio(), trampa, ubicacion()));
      } catch (e) {
        setError(mensajeError(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (paso < TOTAL - 1) setPaso(paso + 1);
    else await terminar();
  };

  // Campo trampa: invisible para personas, los bots lo completan.
  const trampaInput = (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Sitio web
        <input tabIndex={-1} autoComplete="off" name="sitio_web" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
      </label>
    </div>
  );

  if (fase === 'cargando')
    return (
      <Shell>
        <p className="m-auto text-ink-2">Cargando…</p>
      </Shell>
    );

  if (fase === 'intro')
    return (
      <Shell>
        {trampaInput}
        <div ref={titulo} tabIndex={-1} className="outline-none my-auto space-y-5">
          <h1 className="text-[28px] leading-tight font-bold">
            Ayudanos a armar Che <span aria-hidden>🧉</span>
          </h1>
          <p className="text-[17px] leading-relaxed">
            Che es una app para conseguir ayuda (un arreglo, una mudanza, alguien que cuide a tu perro) a través de gente en
            la que ya confiás: tus amigos y los amigos de tus amigos. Y para que quien hace changas consiga más trabajo y
            cobre seguro.
          </p>
          <p className="text-[17px] leading-relaxed">
            Antes de seguir construyéndola, queremos escucharte, ya sea que contrates changas, las hagas o las dos cosas.
          </p>
          <ul className="space-y-3 rounded-xl bg-card border border-divider p-4 text-[16px]">
            {[
              ['⏱️', '10 preguntas, unos 3 minutos.'],
              ['👆', 'Casi todo se responde tocando una opción.'],
              ['🤷', 'Si una pregunta no tiene que ver con vos, tocá "No aplica para mí".'],
              ['🎤', 'Si preferís hablar en vez de escribir, mandá un audio.'],
              [
                '🔒',
                profile
                  ? 'Es confidencial: tus respuestas y audios solo los ve el equipo de Che. Como entraste con tu cuenta, guardamos tu usuario junto a tus respuestas.'
                  : 'Es confidencial: tus respuestas y audios solo los ve el equipo de Che. No hace falta tener cuenta.',
              ],
            ].map(([icono, texto]) => (
              <li key={icono} className="flex gap-3">
                <span className="text-xl leading-6 shrink-0" aria-hidden>{icono}</span>
                <span>{texto}</span>
              </li>
            ))}
          </ul>
          {/* Celular (<640px): fijo abajo para que se vea sin scrollear. Pantallas grandes: en su lugar. */}
          <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-page border-t border-divider sm:static sm:z-auto sm:mx-0 sm:p-0 sm:bg-transparent sm:border-0">
            <button
              className="btn-primary w-full h-14 text-[18px] rounded-xl focus-visible:outline-offset-2"
              onClick={() => setFase('pregunta')}
            >
              {retomar ? 'Seguir donde quedé' : 'Empezar'}
            </button>
          </div>
          <p className="text-sm text-ink-2 text-center">
            Podés dejarla por la mitad y seguir después desde este mismo celular.{' '}
            <Link to="/privacidad" className="link">Cómo usamos tus datos</Link>
          </p>
        </div>
      </Shell>
    );

  if (fase === 'final') {
    const share = `https://wa.me/?text=${encodeURIComponent(`Estoy ayudando a armar Che, una app para conseguir changas por tu red de confianza. Son 3 minutos: ${window.location.origin}/encuesta`)}`;
    return (
      <Shell>
        {trampaInput}
        <div className="my-auto space-y-6">
          <div ref={titulo} tabIndex={-1} className="outline-none text-center space-y-2">
            <h1 className="text-[28px] leading-tight font-bold">¡Gracias!</h1>
            <p className="text-[18px]">Tu respuesta nos ayuda a armar Che.</p>
          </div>
          {/* Si salteó todo, no hay respuesta a la que sumarle un contacto. */}
          {(respuestaId || Object.values(items).some(itemTieneAlgo)) && <ContactoFinal token={tok.current} trampa={trampa} />}
          <a href={share} target="_blank" rel="noreferrer" className="btn-primary w-full h-14 text-[17px] rounded-xl">
            <Share2 size={20} aria-hidden /> Compartir por WhatsApp
          </a>
          <Link to="/" className="btn-ghost w-full">Ir a Che</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {trampaInput}
      <div ref={titulo} tabIndex={-1} className="outline-none mb-5">
        <div className="flex items-center justify-between text-[15px] font-semibold text-ink-2 mb-2">
          <span>{paso + 1} de {TOTAL}</span>
          <button type="button" className="underline hover:text-ink px-2 py-1" onClick={() => avanzar(false)} disabled={busy}>
            Saltear
          </button>
        </div>
        <div className="h-2 rounded-full bg-divider overflow-hidden" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={paso + 1} aria-label={`Pregunta ${paso + 1} de ${TOTAL}`}>
          <div className="h-full bg-brand-fill transition-all" style={{ width: `${((paso + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      {paso === 0 && (
        <Ubicacion
          pais={pais}
          zona={zona}
          onPais={(x) => {
            setPais(x);
            setErrorPais(null);
          }}
          onZona={setZona}
          error={errorPais}
        />
      )}
      <PreguntaPantalla
        key={p.id}
        p={p}
        item={item}
        onChange={setItem}
        respuestaId={respuestaId}
        asegurarRespuesta={asegurarRespuesta}
        pais={pais}
      />

      {error && <p className="text-danger mt-4" role="alert">{error}</p>}

      <div className="sticky bottom-0 -mx-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] mt-6 bg-page flex gap-3">
        <button type="button" className="btn-secondary h-14 px-6 text-[17px] rounded-xl" disabled={paso === 0 || busy} onClick={() => setPaso(paso - 1)}>
          Atrás
        </button>
        <button type="button" className="btn-primary h-14 grow text-[17px] rounded-xl" disabled={busy} onClick={() => avanzar(true)}>
          {busy ? 'Guardando…' : paso === TOTAL - 1 ? 'Terminar' : 'Siguiente'}
        </button>
      </div>
    </Shell>
  );
}
