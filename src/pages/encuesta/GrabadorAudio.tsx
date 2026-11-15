import { useEffect, useId, useRef, useState } from 'react';
import { Mic, Square, Trash2, RotateCcw } from 'lucide-react';
import { MAX_AUDIO_SEGUNDOS } from '../../lib/encuesta/preguntas';
import { mensajeError, subirAudio } from '../../lib/encuesta/api';

// Web Speech API: no está en los tipos de TypeScript y solo existe en algunos navegadores.
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SRCtor = new () => SpeechRecognitionLike;
const SpeechRecognitionCtor: SRCtor | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition)
    : undefined;

const PUEDE_GRABAR = typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

function mimeType(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

type Estado = 'idle' | 'grabando' | 'subiendo' | 'listo' | 'error_subida';

/**
 * "Contalo con un audio": graba hasta 2 minutos, deja escuchar, borrar y volver a grabar.
 * Sube el audio apenas se detiene. Si el navegador puede, transcribe en vivo (es-AR) y
 * deja corregir el texto; si no, se guarda solo el audio.
 */
export default function GrabadorAudio({
  audioPath,
  transcripcion,
  respuestaId,
  asegurarRespuesta,
  onChange,
}: {
  audioPath: string | null;
  transcripcion: string;
  respuestaId: string | null;
  asegurarRespuesta: () => Promise<string>;
  onChange: (a: { audio_url: string | null; transcripcion: string }) => void;
}) {
  const [estado, setEstado] = useState<Estado>(audioPath ? 'listo' : 'idle');
  const [segundos, setSegundos] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState(transcripcion);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const reco = useRef<SpeechRecognitionLike | null>(null);
  const grabandoRef = useRef(false);
  const finalText = useRef('');
  const timer = useRef<number | null>(null);
  const transId = useId();

  // Limpieza al salir de la pregunta.
  useEffect(
    () => () => {
      grabandoRef.current = false;
      if (timer.current) window.clearInterval(timer.current);
      try {
        reco.current?.stop();
      } catch {
        /* ignore */
      }
      // Si se va de la pregunta mientras graba, se descarta esa grabación.
      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => () => void (blobUrl && URL.revokeObjectURL(blobUrl)), [blobUrl]);

  const subir = async (b: Blob, trans: string) => {
    setEstado('subiendo');
    setAviso(null);
    try {
      const id = respuestaId ?? (await asegurarRespuesta());
      const path = await subirAudio(id, b);
      onChange({ audio_url: path, transcripcion: trans });
      setEstado('listo');
    } catch (e) {
      setAviso(mensajeError(e));
      setEstado('error_subida');
    }
  };

  const empezarTranscripcion = () => {
    if (!SpeechRecognitionCtor) return;
    try {
      const r = new SpeechRecognitionCtor();
      r.lang = 'es-AR';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText.current += `${res[0].transcript.trim()} `;
          else interim += res[0].transcript;
        }
        setTexto((finalText.current + interim).trim());
      };
      // Chrome corta tras un silencio: si seguimos grabando, se vuelve a encender.
      r.onend = () => {
        if (grabandoRef.current) {
          try {
            r.start();
          } catch {
            /* ignore */
          }
        }
      };
      r.onerror = () => undefined; // si falla (frecuente en iPhone), queda solo el audio
      r.start();
      reco.current = r;
    } catch {
      reco.current = null;
    }
  };

  const grabar = async () => {
    setAviso(null);
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setAviso(
        name === 'NotFoundError'
          ? 'No encontramos un micrófono. Si querés, contalo por escrito arriba.'
          : 'No tenemos permiso para usar el micrófono. Podés habilitarlo en tu navegador o contarlo por escrito arriba.',
      );
      return;
    }
    stream.current = s;
    const mt = mimeType();
    const rec = new MediaRecorder(s, mt ? { mimeType: mt } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      s.getTracks().forEach((t) => t.stop());
      const b = new Blob(chunks, { type: rec.mimeType || mt || 'audio/webm' });
      setBlob(b);
      setBlobUrl(URL.createObjectURL(b));
      const trans = finalText.current.trim() || texto;
      setTexto(trans);
      void subir(b, trans);
    };
    recorder.current = rec;
    finalText.current = '';
    setTexto('');
    setSegundos(0);
    grabandoRef.current = true;
    rec.start(1000);
    setEstado('grabando');
    empezarTranscripcion();
    const inicio = Date.now();
    timer.current = window.setInterval(() => {
      const t = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(t);
      if (t >= MAX_AUDIO_SEGUNDOS) detener();
    }, 250);
  };

  function detener() {
    grabandoRef.current = false;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    try {
      reco.current?.stop();
    } catch {
      /* ignore */
    }
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const borrar = () => {
    setBlob(null);
    setBlobUrl(null);
    setTexto('');
    setEstado('idle');
    setAviso(null);
    onChange({ audio_url: null, transcripcion: '' });
  };

  if (!PUEDE_GRABAR)
    return <p className="text-sm text-ink-2">Tu navegador no permite grabar audio. Podés contarlo por escrito arriba.</p>;

  return (
    <div className="rounded-xl border border-divider bg-card p-3 space-y-3">
      {estado === 'idle' && (
        <button
          type="button"
          onClick={grabar}
          aria-label={`Contalo con un audio (máximo ${MAX_AUDIO_SEGUNDOS / 60} minutos)`}
          className="w-full h-14 rounded-xl bg-brand-soft text-brand font-semibold text-[17px] flex items-center justify-center gap-2 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Mic size={22} aria-hidden /> Contalo con un audio
        </button>
      )}

      {estado === 'grabando' && (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-danger animate-pulse shrink-0" aria-hidden />
          <span className="grow font-semibold tabular-nums text-[17px]" role="status">
            Grabando… <span aria-hidden>{mmss(segundos)} / {mmss(MAX_AUDIO_SEGUNDOS)}</span>
          </span>
          <button type="button" onClick={detener} className="btn-danger h-12 px-4 rounded-xl" aria-label="Detener la grabación">
            <Square size={18} aria-hidden /> Detener
          </button>
        </div>
      )}

      {(estado === 'subiendo' || estado === 'listo' || estado === 'error_subida') && (
        <div className="space-y-2">
          {blobUrl ? (
            <audio controls src={blobUrl} className="w-full" aria-label="Escuchar tu audio" />
          ) : (
            <p className="text-[15px]">Tenés un audio guardado en esta pregunta.</p>
          )}
          <p className="text-sm text-ink-2" role="status">
            {estado === 'subiendo' ? 'Guardando el audio…' : estado === 'listo' ? 'Audio guardado.' : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {estado === 'error_subida' && blob && (
              <button type="button" className="btn-primary h-11" onClick={() => subir(blob, texto)}>
                Reintentar
              </button>
            )}
            <button type="button" className="btn-secondary h-11" onClick={borrar} disabled={estado === 'subiendo'}>
              <Trash2 size={16} aria-hidden /> Borrar
            </button>
            <button
              type="button"
              className="btn-secondary h-11"
              disabled={estado === 'subiendo'}
              onClick={() => {
                borrar();
                void grabar();
              }}
            >
              <RotateCcw size={16} aria-hidden /> Volver a grabar
            </button>
          </div>
        </div>
      )}

      {(estado !== 'idle' || texto) && (SpeechRecognitionCtor || texto) && (
        <div>
          <label htmlFor={transId} className="block text-sm font-semibold mb-1">
            Lo que entendimos (podés corregirlo)
          </label>
          <textarea
            id={transId}
            className="input min-h-[72px] text-[15px]"
            maxLength={4000}
            value={texto}
            readOnly={estado === 'grabando'}
            placeholder={estado === 'grabando' ? 'Escuchando…' : 'No pudimos transcribirlo, pero el audio quedó guardado.'}
            onChange={(e) => {
              setTexto(e.target.value);
              if (audioPath) onChange({ audio_url: audioPath, transcripcion: e.target.value });
            }}
          />
        </div>
      )}

      {aviso && (
        <p className="text-[15px] rounded-lg bg-soon-bg text-soon p-3" role="alert">
          {aviso}
        </p>
      )}
    </div>
  );
}
