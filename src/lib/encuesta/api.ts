import { supabase } from '../supabase';
import type { Pais, PreguntaId } from './preguntas';

/** Estado local de la encuesta: un token por respuesta y un id por dispositivo (para el límite diario). */
const TOKEN_KEY = 'che-encuesta-token';
const DEVICE_KEY = 'che-encuesta-dispositivo';
export const HECHA_KEY = 'che-encuesta-hecha';

export interface Item {
  opciones: string[];
  no_aplica: boolean;
  texto: string;
  audio_url: string | null;
  transcripcion: string;
}
export const itemVacio = (): Item => ({ opciones: [], no_aplica: false, texto: '', audio_url: null, transcripcion: '' });
export const itemTieneAlgo = (i: Item) => i.opciones.length > 0 || i.no_aplica || i.texto.trim() !== '' || i.audio_url !== null;

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

function store(key: string, value?: string | null) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin localStorage: la encuesta funciona igual, pero no se puede retomar */
  }
  return null;
}

let memToken: string | null = null;
/** Token de la respuesta en curso (lo crea si no hay). */
export function token(): string {
  const t = store(TOKEN_KEY) ?? memToken ?? randomHex(32);
  memToken = t;
  store(TOKEN_KEY, t);
  return t;
}
export function hayEncuestaEnCurso() {
  return Boolean(store(TOKEN_KEY));
}
/** Al terminar: la próxima vez empieza una respuesta nueva. */
export function olvidarToken() {
  store(TOKEN_KEY, null);
  memToken = null;
  store(HECHA_KEY, '1');
}
function dispositivo(): string {
  let d = store(DEVICE_KEY);
  if (!d) {
    d = randomHex(16);
    store(DEVICE_KEY, d);
  }
  return d;
}

export async function guardar(
  tok: string,
  pregunta: PreguntaId,
  item: Item,
  trampa: string,
  ubicacion?: { pais: Pais; zona: string },
): Promise<string> {
  const { data, error } = await supabase.rpc('encuesta_guardar', {
    p_token: tok,
    p_dispositivo: dispositivo(),
    p_pregunta: pregunta,
    p_opciones: item.no_aplica ? [] : item.opciones,
    p_no_aplica: item.no_aplica,
    p_texto: item.texto.slice(0, 1000),
    p_audio: item.audio_url,
    p_transcripcion: item.transcripcion.slice(0, 4000),
    p_user_agent: navigator.userAgent.slice(0, 300),
    p_trampa: trampa || null,
    p_pais: ubicacion?.pais ?? null,
    p_zona: ubicacion ? ubicacion.zona.trim().slice(0, 60) : null,
  });
  if (error) throw error;
  return data as string;
}

export async function estado(
  tok: string,
): Promise<{ respuesta_id: string; completa: boolean; pais: Pais | null; zona: string | null; items: (Item & { pregunta_id: PreguntaId })[] } | null> {
  const { data, error } = await supabase.rpc('encuesta_estado', { p_token: tok });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    respuesta_id: string;
    completa: boolean;
    pais: Pais | null;
    zona: string | null;
    items: (Partial<Item> & { pregunta_id: PreguntaId })[];
  };
  return {
    ...d,
    items: d.items.map((i) => ({
      pregunta_id: i.pregunta_id,
      opciones: i.opciones ?? [],
      no_aplica: Boolean(i.no_aplica),
      texto: i.texto ?? '',
      audio_url: i.audio_url ?? null,
      transcripcion: i.transcripcion ?? '',
    })),
  };
}

export type Horario = 'manana' | 'tarde' | 'noche';

/** Email o teléfono de 8 a 15 dígitos (el servidor valida lo mismo). */
export const contactoValido = (c: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) || (/^\+?[0-9 ()-]+$/.test(c) && c.replace(/\D/g, '').length >= 8 && c.replace(/\D/g, '').length <= 15);

/** Marca la respuesta como completa. Con `datos`, guarda además el aviso/charla y el contacto. */
export async function completar(
  tok: string,
  trampa: string,
  datos?: { aviso: boolean; charla: boolean; nombre: string; contacto: string; horario: Horario | null },
) {
  const { error } = await supabase.rpc('encuesta_completar', {
    p_token: tok,
    p_trampa: trampa || null,
    p_quiere_aviso: datos?.aviso ?? false,
    p_quiere_charla: datos?.charla ?? false,
    p_nombre: datos?.nombre ?? null,
    p_contacto: datos?.contacto ?? null,
    p_horario: datos?.horario ?? null,
  });
  if (error) throw error;
}

/** Sube un audio al bucket privado, dentro de la carpeta de la respuesta. Devuelve la ruta. */
export async function subirAudio(respuestaId: string, blob: Blob): Promise<string> {
  const base = blob.type.split(';')[0] || 'audio/webm';
  const ext = base === 'audio/mp4' || base === 'audio/x-m4a' ? 'm4a' : base === 'audio/ogg' ? 'ogg' : 'webm';
  const path = `${respuestaId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('encuesta-audios').upload(path, blob, { contentType: base, upsert: false });
  if (error) throw error;
  return path;
}

/** Mensaje simple para los errores del servidor. */
export function mensajeError(e: unknown): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (m.includes('encuesta_limit')) return 'Ya se respondió varias veces hoy desde este dispositivo. ¡Gracias!';
  if (m.includes('encuesta_completa')) return 'Esta encuesta ya está terminada. ¡Gracias!';
  if (/fetch|network|Failed/i.test(m)) return 'No hay conexión. Revisá tu internet y probá de nuevo.';
  return 'No pudimos guardar. Probá de nuevo.';
}
