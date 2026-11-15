import { supabase } from './supabase';

/** Ayuda: reclamos, feedback, valoraciones y votos. Todo pasa por RPCs que validan en el servidor. */

export type ReclamoEstado = 'recibido' | 'en_revision' | 'esperando_respuesta' | 'resuelto' | 'cerrado';
export type ReclamoRol = 'pedi' | 'hice';
export type ReclamoMotivo =
  | 'no_se_presento'
  | 'no_pago'
  | 'trabajo_mal'
  | 'cambio_acuerdo'
  | 'trato_irrespetuoso'
  | 'inseguro'
  | 'otro';
export type ReclamoResultado = 'hablarlo' | 'corregir' | 'pago' | 'registro' | 'bloquear';

export const MOTIVOS: ReclamoMotivo[] = ['no_se_presento', 'no_pago', 'trabajo_mal', 'cambio_acuerdo', 'trato_irrespetuoso', 'inseguro', 'otro'];
export const RESULTADOS: ReclamoResultado[] = ['hablarlo', 'corregir', 'pago', 'registro', 'bloquear'];
export const ESTADOS: ReclamoEstado[] = ['recibido', 'en_revision', 'esperando_respuesta', 'resuelto', 'cerrado'];

export const MIN_DESCRIPCION = 20;
export const MAX_ADJUNTOS = 3;
export const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp'];

export interface Candidato {
  id: string;
  display_name: string;
  avatar_url: string | null;
  neighbourhood: string | null;
}

export interface ReclamoDetalle {
  id: string;
  codigo: string;
  soy: 'autor' | 'contra' | 'admin';
  autor_id: string;
  autor_nombre: string | null;
  contra_id: string;
  contra_nombre: string | null;
  rol_autor: ReclamoRol;
  motivo: ReclamoMotivo;
  descripcion: string | null;
  descripcion_privada: boolean;
  fecha_hecho: string;
  resultado_deseado: ReclamoResultado;
  estado: ReclamoEstado;
  respuesta_limite: string | null;
  puede_responder: boolean;
  desde_chat: boolean;
  confirmado: boolean | null;
  creado_en: string;
  actualizado_en: string;
}

export interface ReclamoMensaje {
  id: string;
  autor_id: string | null;
  autor_nombre: string | null;
  texto: string;
  es_interno: boolean;
  visible_para: 'ambos' | 'autor' | 'contra';
  creado_en: string;
}

export interface ReclamoHistorial {
  id: string;
  estado: ReclamoEstado;
  creado_en: string;
}

export interface MiReclamo {
  id: string;
  codigo: string;
  soy: 'autor' | 'contra';
  otra_id: string;
  otra_nombre: string;
  otra_avatar: string | null;
  motivo: ReclamoMotivo;
  estado: ReclamoEstado;
  respuesta_limite: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface ValoracionPendiente {
  favor_id: string;
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  request_text: string;
  completed_at: string;
  soy: ReclamoRol;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
const first = <T,>(x: T[] | T | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Checks a picked file before upload (the bucket enforces the same limits server-side). */
export function fileProblem(f: File): 'type' | 'size' | null {
  if (!TIPOS_OK.includes(f.type)) return 'type';
  if (f.size > MAX_BYTES) return 'size';
  return null;
}

/**
 * Re-encodes an image through a canvas before upload. This drops EXIF/XMP
 * metadata (GPS location, camera, date) and downsizes very large photos.
 */
async function sinMetadatos(file: File, max = 1600): Promise<{ blob: Blob; ext: 'jpg' | 'png' }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Screenshots (PNG) keep text sharp; photos go to JPEG.
    const png = file.type === 'image/png';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
    if (!blob) throw new Error('canvas');
    return { blob, ext: png ? 'png' : 'jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploads to the private "reclamos" bucket under <me>/<uuid>.<ext>. Returns the storage path. */
export async function subirImagenPrivada(me: string, file: File): Promise<string> {
  const { blob, ext } = await sinMetadatos(file);
  if (blob.size > MAX_BYTES) throw new Error('upload');
  const path = `${me}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('reclamos')
    .upload(path, blob, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Short-lived links (5 min) for private images. */
export async function urlsFirmadas(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('reclamos').createSignedUrls(paths, 300);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])));
}

export const ayudaApi = {
  candidatos: () => rpc<Candidato[]>('reclamo_candidatos'),
  crearReclamo: async (a: {
    contra: string;
    rol: ReclamoRol;
    motivo: ReclamoMotivo;
    descripcion: string;
    fecha: string;
    resultado: ReclamoResultado;
    privada: boolean;
    adjuntos: string[];
    desdeChat: boolean;
    favor: string | null;
  }) =>
    first(
      await rpc<{ id: string; codigo: string }[]>('crear_reclamo', {
        p_contra: a.contra,
        p_rol: a.rol,
        p_motivo: a.motivo,
        p_descripcion: a.descripcion,
        p_fecha: a.fecha,
        p_resultado: a.resultado,
        p_privada: a.privada,
        p_adjuntos: a.adjuntos,
        p_desde_chat: a.desdeChat,
        p_favor: a.favor,
      }),
    )!,
  verReclamo: async (id: string) => first(await rpc<ReclamoDetalle[]>('ver_reclamo', { p_reclamo: id })),
  mensajes: (id: string) => rpc<ReclamoMensaje[]>('ver_reclamo_mensajes', { p_reclamo: id }),
  adjuntos: (id: string) =>
    rpc<{ id: string; url: string; subido_por: string; es_privado: boolean }[]>('ver_reclamo_adjuntos', { p_reclamo: id }),
  historial: async (id: string) => {
    const { data, error } = await supabase
      .from('reclamo_historial')
      .select('id, estado, creado_en')
      .eq('reclamo_id', id)
      .order('creado_en');
    if (error) throw error;
    return (data ?? []) as ReclamoHistorial[];
  },
  responder: (id: string, texto: string, privado: boolean) =>
    rpc('responder_reclamo', { p_reclamo: id, p_texto: texto, p_privado: privado }),
  misReclamos: () => rpc<MiReclamo[]>('mis_reclamos'),

  feedback: (a: {
    tipo: 'idea' | 'confuso' | 'gusto' | 'carita' | 'tecnico';
    texto?: string;
    puntaje?: number;
    permiteContacto?: boolean;
    intentaba?: string;
    captura?: string | null;
  }) =>
    rpc<string>('enviar_feedback', {
      p_tipo: a.tipo,
      p_texto: a.texto ?? null,
      p_puntaje: a.puntaje ?? null,
      p_permite_contacto: a.permiteContacto ?? false,
      // Página y navegador, sin datos personales extra (el servidor quita ?query y #hash).
      p_url: window.location.pathname,
      p_navegador: navigator.userAgent,
      p_intentaba: a.intentaba ?? null,
      p_captura: a.captura ?? null,
    }),

  valorar: (favor: string, cumplio: 'si' | 'en_parte' | 'no', recomendaria: boolean | null, comentario: string) =>
    rpc<string>('valorar_favor', { p_favor: favor, p_cumplio: cumplio, p_recomendaria: recomendaria, p_comentario: comentario }),
  valoracionesPendientes: () => rpc<ValoracionPendiente[]>('valoraciones_pendientes'),

  roadmapConteo: () => rpc<{ funcion: string; votos: number; yo: boolean }[]>('roadmap_conteo'),
  votar: async (me: string, funcion: string, on: boolean) => {
    const q = on
      ? supabase.from('roadmap_votos').insert({ funcion, usuario_id: me })
      : supabase.from('roadmap_votos').delete().eq('funcion', funcion).eq('usuario_id', me);
    const { error } = await q;
    if (error && error.code !== '23505') throw error;
  },
};

/** "2026-11-15" in local time, for <input type="date">. */
export function hoyISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fechaCorta(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    hour: iso.length > 10 ? '2-digit' : undefined,
    minute: iso.length > 10 ? '2-digit' : undefined,
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
}
