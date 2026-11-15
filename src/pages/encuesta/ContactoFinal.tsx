import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { completar, contactoValido, mensajeError, type Horario } from '../../lib/encuesta/api';

const HORARIOS: { id: Horario; label: string }[] = [
  { id: 'manana', label: 'Mañana' },
  { id: 'tarde', label: 'Tarde' },
  { id: 'noche', label: 'Noche' },
];

function Casilla({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 min-h-[56px] text-[16px] cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
        checked ? 'border-brand bg-brand-soft' : 'border-divider bg-card hover:bg-hover'
      }`}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={`mt-0.5 h-6 w-6 shrink-0 rounded-md border-2 flex items-center justify-center ${checked ? 'bg-brand-fill border-brand-fill text-white' : 'border-divider'}`}
        aria-hidden
      >
        {checked && <Check size={16} strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </label>
  );
}

/** Pantalla final: aviso de lanzamiento y/o charla de 15 min. Nada es obligatorio si no tilda ninguna. */
export default function ContactoFinal({ token, trampa }: { token: string; trampa: string }) {
  const [aviso, setAviso] = useState(false);
  const [charla, setCharla] = useState(false);
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [horario, setHorario] = useState<Horario | null>(null);
  const [intento, setIntento] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const id = useId();

  const pide = aviso || charla;
  const errNombre = !nombre.trim() ? 'Poné tu nombre o un apodo.' : null;
  const errContacto = !contacto.trim()
    ? 'Poné tu WhatsApp o tu email.'
    : !contactoValido(contacto.trim())
      ? 'Revisá el formato: un email (nombre@mail.com) o un WhatsApp con código de área.'
      : null;
  const errHorario = charla && !horario ? 'Elegí un horario.' : null;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntento(true);
    if (!pide || errNombre || errContacto || errHorario) return;
    setBusy(true);
    setError(null);
    try {
      await completar(token, trampa, { aviso, charla, nombre: nombre.trim(), contacto: contacto.trim(), horario: charla ? horario : null });
      setOk(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (ok)
    return (
      <p className="rounded-xl bg-success/15 text-success p-4 text-center font-medium" role="status">
        {charla ? '¡Gracias! Te escribimos para coordinar la charla.' : '¡Listo! Te avisamos cuando Che esté lista.'}
      </p>
    );

  return (
    <form className="space-y-3" onSubmit={enviar} noValidate>
      <fieldset className="space-y-2">
        <legend className="sr-only">¿Querés que te contactemos?</legend>
        <Casilla checked={aviso} onChange={setAviso}>
          Avisame cuando Che esté lista
        </Casilla>
        <Casilla checked={charla} onChange={setCharla}>
          Me animo a una charla de 15 minutos para contar mi experiencia (por WhatsApp o videollamada)
        </Casilla>
      </fieldset>

      {pide && (
        <div className="space-y-3 rounded-xl bg-card border border-divider p-4">
          <div>
            <label htmlFor={`${id}-nombre`} className="block text-[16px] font-semibold mb-1">
              ¿Cómo te llamamos?
            </label>
            <input
              id={`${id}-nombre`}
              className="input h-12 text-[16px]"
              placeholder="Nombre o apodo"
              autoComplete="given-name"
              maxLength={60}
              value={nombre}
              aria-invalid={intento && Boolean(errNombre)}
              aria-describedby={intento && errNombre ? `${id}-e-nombre` : undefined}
              onChange={(e) => setNombre(e.target.value)}
            />
            {intento && errNombre && <p id={`${id}-e-nombre`} className="text-danger text-sm mt-1" role="alert">{errNombre}</p>}
          </div>
          <div>
            <label htmlFor={`${id}-contacto`} className="block text-[16px] font-semibold mb-1">
              WhatsApp o email
            </label>
            <input
              id={`${id}-contacto`}
              className="input h-12 text-[16px]"
              placeholder="099 123 456 o nombre@mail.com"
              inputMode="email"
              autoComplete="email"
              maxLength={200}
              value={contacto}
              aria-invalid={intento && Boolean(errContacto)}
              aria-describedby={intento && errContacto ? `${id}-e-contacto` : undefined}
              onChange={(e) => setContacto(e.target.value)}
            />
            {intento && errContacto && <p id={`${id}-e-contacto`} className="text-danger text-sm mt-1" role="alert">{errContacto}</p>}
          </div>
          {charla && (
            <fieldset aria-describedby={intento && errHorario ? `${id}-e-horario` : undefined}>
              <legend className="block text-[16px] font-semibold mb-1">¿Cuándo te queda mejor?</legend>
              <div className="grid grid-cols-3 gap-2">
                {HORARIOS.map((h) => (
                  <label
                    key={h.id}
                    className={`flex items-center justify-center rounded-xl border-2 h-12 text-[16px] cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                      horario === h.id ? 'border-brand bg-brand-soft font-semibold' : 'border-divider hover:bg-hover'
                    }`}
                  >
                    <input type="radio" name={`${id}-horario`} className="sr-only" checked={horario === h.id} onChange={() => setHorario(h.id)} />
                    {h.label}
                  </label>
                ))}
              </div>
              {intento && errHorario && <p id={`${id}-e-horario`} className="text-danger text-sm mt-1" role="alert">{errHorario}</p>}
            </fieldset>
          )}
          <p className="text-sm text-ink-2">Solo lo usamos para esto. Si querés que lo borremos, escribinos.</p>
          <button className="btn-secondary w-full h-12" disabled={busy}>
            {busy ? 'Guardando…' : 'Enviar'}
          </button>
        </div>
      )}
      {error && <p className="text-danger text-center" role="alert">{error}</p>}
    </form>
  );
}
