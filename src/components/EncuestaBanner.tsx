import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { HECHA_KEY } from '../lib/encuesta/api';

const CERRADO_KEY = 'che-encuesta-banner-cerrado';
const leer = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};

/** Tarjeta en Inicio: "Ayudanos a armar Che: 3 minutos" → /encuesta. Se puede cerrar. */
export default function EncuestaBanner() {
  const [oculto, setOculto] = useState(() => leer(CERRADO_KEY) || leer(HECHA_KEY));
  if (oculto) return null;
  const cerrar = () => {
    try {
      localStorage.setItem(CERRADO_KEY, '1');
    } catch {
      /* ignore */
    }
    setOculto(true);
  };
  return (
    <div className="card p-3 flex items-center gap-3 border-brand/40">
      <Link to="/encuesta" className="grow min-w-0 rounded-lg p-1 -m-1 hover:bg-hover">
        <span className="block font-semibold">Ayudanos a armar Che: 3 minutos</span>
        <span className="block text-sm text-ink-2">10 preguntas sobre cómo conseguís (o hacés) changas.</span>
      </Link>
      <Link to="/encuesta" className="btn-primary shrink-0">Responder</Link>
      <button className="icon-btn h-8 w-8 bg-transparent shrink-0" onClick={cerrar} aria-label="Cerrar">
        <X size={18} />
      </button>
    </div>
  );
}
