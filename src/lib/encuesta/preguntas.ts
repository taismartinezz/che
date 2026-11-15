/**
 * Preguntas de la encuesta pública (/encuesta).
 * Se pueden editar acá sin tocar la UI. Si cambiás un `id` de opción, las respuestas
 * viejas con el id anterior dejan de contarse en /encuesta/resultados.
 * Límites que también valida el servidor: P1, P6, P9 y P10 son de opción única;
 * P4 y P8, hasta 3 (ver encuesta_guardar en la migración).
 */

export type PreguntaId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8' | 'p9' | 'p10';

export interface Opcion {
  id: string;
  emoji: string;
  label: string;
  /** Texto distinto según el país elegido (mismo id de opción). */
  labelPorPais?: Partial<Record<Pais, string>>;
}

/** "¿Dónde vivís?" se pide en la misma pantalla que P1. */
export const PAISES = [
  { id: 'uy', emoji: '🇺🇾', label: 'Uruguay' },
  { id: 'ar', emoji: '🇦🇷', label: 'Argentina' },
  { id: 'otro', emoji: '🌎', label: 'Otro país' },
] as const;
export type Pais = (typeof PAISES)[number]['id'];
export const MAX_ZONA = 60;

export const labelDe = (o: Opcion, pais: Pais | null) => (pais && o.labelPorPais?.[pais]) || o.label;

export interface Pregunta {
  id: PreguntaId;
  titulo: string;
  /** 'unica' = una sola; 'multiple' = varias (con `max` opcional). */
  tipo: 'unica' | 'multiple';
  max?: number;
  opciones: Opcion[];
  /** Título del campo de texto/audio. Por defecto: "¿Querés contar algo más?" */
  textoTitulo?: string;
}

export const ROLES = { contrato: 'Contratan', trabajo: 'Trabajan', ambos: 'Las dos cosas' } as const;
export type Rol = keyof typeof ROLES;

export const PREGUNTAS: Pregunta[] = [
  {
    id: 'p1',
    titulo: '¿Cómo participás de las changas?',
    tipo: 'unica',
    opciones: [
      { id: 'contrato', emoji: '🙋', label: 'Contrato changas o servicios' },
      { id: 'trabajo', emoji: '🧰', label: 'Hago changas o trabajos' },
      { id: 'ambos', emoji: '🔁', label: 'Las dos cosas' },
    ],
  },
  {
    id: 'p2',
    titulo: '¿Cómo conseguís hoy a alguien (o trabajo)?',
    tipo: 'multiple',
    opciones: [
      { id: 'familia_amigos', emoji: '👨‍👩‍👧', label: 'Familia o amigos' },
      { id: 'grupos', emoji: '💬', label: 'Grupos de WhatsApp o Facebook' },
      { id: 'google_ml', emoji: '🔎', label: 'Google o Mercado Libre' },
      { id: 'app', emoji: '📱', label: 'Alguna app' },
      { id: 'carteles', emoji: '📌', label: 'Carteles o volantes' },
      { id: 'otro', emoji: '➕', label: 'Otro' },
    ],
  },
  {
    id: 'p3',
    titulo: '¿Qué es lo más difícil?',
    tipo: 'multiple',
    opciones: [
      { id: 'disponible', emoji: '📅', label: 'Encontrar a alguien disponible' },
      { id: 'confianza', emoji: '🤝', label: 'Saber si es de confianza' },
      { id: 'precio', emoji: '💲', label: 'Ponerse de acuerdo en el precio' },
      { id: 'horario', emoji: '⏰', label: 'Que cumpla el horario' },
      { id: 'calidad', emoji: '🛠️', label: 'Que el trabajo quede bien' },
      { id: 'cobrar', emoji: '💸', label: 'Cobrar lo acordado' },
    ],
  },
  {
    id: 'p4',
    titulo: 'Para dejar entrar a alguien a tu casa, ¿qué te da más confianza?',
    tipo: 'multiple',
    max: 3,
    opciones: [
      { id: 'recomendacion', emoji: '🗣️', label: 'Que me lo recomiende alguien que conozco' },
      { id: 'dni', emoji: '🪪', label: 'DNI verificado' },
      { id: 'opiniones', emoji: '⭐', label: 'Opiniones de otros clientes' },
      { id: 'foto_nombre', emoji: '🖼️', label: 'Foto y nombre completo' },
      { id: 'antecedentes', emoji: '📄', label: 'Antecedentes verificados' },
      { id: 'compartir', emoji: '👀', label: 'Compartir con un familiar quién viene y a qué hora' },
    ],
  },
  {
    id: 'p5',
    titulo: 'Si algo sale mal, ¿qué te gustaría que pase?',
    tipo: 'multiple',
    opciones: [
      { id: 'rehacer', emoji: '🔧', label: 'Que lo vuelva a hacer bien' },
      { id: 'devolucion', emoji: '💰', label: 'Que me devuelvan la plata' },
      { id: 'opinion', emoji: '✍️', label: 'Dejar una opinión' },
      { id: 'mediacion', emoji: '⚖️', label: 'Que Che medie entre las dos partes' },
      { id: 'bloqueo', emoji: '🚫', label: 'Que lo bloqueen' },
    ],
  },
  {
    id: 'p6',
    titulo: '¿Cómo preferís pagar o cobrar?',
    tipo: 'unica',
    opciones: [
      { id: 'efectivo', emoji: '💵', label: 'Efectivo' },
      { id: 'transferencia', emoji: '🏦', label: 'Transferencia' },
      { id: 'mercado_pago', emoji: '📲', label: 'Mercado Pago' },
      { id: 'por_app', emoji: '🔒', label: 'Que se pague por la app y se libere al terminar' },
      { id: 'igual', emoji: '🤷', label: 'Me da igual' },
    ],
  },
  {
    id: 'p7',
    titulo: 'Trabajando, ¿te pasó alguna de estas cosas?',
    tipo: 'multiple',
    opciones: [
      { id: 'no_pagaron', emoji: '💸', label: 'No me pagaron o me pagaron menos' },
      { id: 'cambiaron', emoji: '🔀', label: 'Me cambiaron lo acordado' },
      { id: 'cancelaron', emoji: '❌', label: 'Me cancelaron a último momento' },
      { id: 'inseguro', emoji: '⚠️', label: 'Me sentí inseguro/a' },
      { id: 'clientes', emoji: '🔍', label: 'Me cuesta conseguir clientes' },
      { id: 'cuanto_cobrar', emoji: '🤔', label: 'No sé cuánto cobrar' },
    ],
  },
  {
    id: 'p8',
    titulo: '¿Qué necesitarías para sentirte respaldado/a?',
    tipo: 'multiple',
    max: 3,
    opciones: [
      { id: 'cobro_seguro', emoji: '✅', label: 'Cobrar seguro (seña o pago antes)' },
      { id: 'comision_baja', emoji: '📉', label: 'Comisión baja o nula' },
      { id: 'mi_version', emoji: '🗨️', label: 'Poder contar mi versión si se quejan' },
      { id: 'opiniones_trabajo', emoji: '⭐', label: 'Que mis opiniones me consigan más trabajo' },
      {
        id: 'monotributo',
        emoji: '🧾',
        label: 'Ayuda con el monotributo',
        labelPorPais: { ar: 'Ayuda con el monotributo (AFIP/ARCA)', uy: 'Ayuda con el monotributo (BPS)' },
      },
      { id: 'seguro', emoji: '🩹', label: 'Un seguro de accidentes' },
    ],
  },
  {
    id: 'p9',
    titulo: '¿Confiás más en un amigo de un amigo que en un desconocido con buenas opiniones?',
    tipo: 'unica',
    opciones: [
      { id: 'mucho_mas', emoji: '💯', label: 'Mucho más' },
      { id: 'un_poco_mas', emoji: '👍', label: 'Un poco más' },
      { id: 'igual', emoji: '🟰', label: 'Igual' },
      { id: 'opiniones', emoji: '⭐', label: 'Prefiero las opiniones' },
    ],
  },
  {
    id: 'p10',
    titulo: '¿Usarías Che?',
    tipo: 'unica',
    opciones: [
      { id: 'si', emoji: '🙌', label: 'Sí, seguro' },
      { id: 'tal_vez', emoji: '🤔', label: 'Tal vez' },
      { id: 'no', emoji: '🙅', label: 'No' },
    ],
    textoTitulo: 'Si pudieras pedirle UNA cosa a Che, ¿qué sería?',
  },
];

export const MAX_TEXTO = 1000;
export const MAX_AUDIO_SEGUNDOS = 120;

/** Máximo de opciones elegibles en una pregunta. */
export const maxOpciones = (p: Pregunta) => (p.tipo === 'unica' ? 1 : (p.max ?? p.opciones.length));
