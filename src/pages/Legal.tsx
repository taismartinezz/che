import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { PublicFooter } from './Login';

// Placeholder legal texts. They are intentionally kept in Spanish only and MUST be
// reviewed by a lawyer in each country before real users join.
const TERMS = [
  ['1. Qué es Che', 'Che, ¿conocés? ("Che") es una plataforma que conecta personas que necesitan una mano con personas de su red que pueden ayudar. Che no presta servicios, no fija precios, no asigna trabajos ni emplea a nadie. Los acuerdos son exclusivamente entre las personas usuarias.'],
  ['2. Quién puede usar Che', 'Personas mayores de 18 años que vivan en Montevideo o Buenos Aires, con datos reales.'],
  ['3. Conducta', 'No se permite publicar contenido ilegal, discriminatorio, engañoso, sexual ni datos personales de terceros, ni usar el chat para acosar, hacer spam o pedir pagos por adelantado. Podés reportar y bloquear perfiles y pedidos. Podemos suspender cuentas que incumplan estas reglas.'],
  ['4. Categorías sensibles', 'En "Niñeras y cuidado" solo se recomiendan personas cuya identidad y certificado de antecedentes fueron revisados por el equipo de Che. La verificación es una revisión manual de documentos y no garantiza el comportamiento futuro de nadie: cada familia sigue siendo responsable de su elección.'],
  ['5. Responsabilidad', 'Cada persona es responsable de evaluar con quién se contacta y de los acuerdos que haga. Che no garantiza la calidad de la ayuda ni el comportamiento de las personas usuarias.'],
  ['6. Funciones futuras', 'Las funciones marcadas como "Próximamente" no están disponibles y pueden cambiar.'],
  ['7. Baja', 'Podés borrar tu cuenta y todos tus datos en cualquier momento desde Configuración.'],
];
const PRIVACY = [
  ['1. Qué datos guardamos', 'Nombre, foto (opcional), ciudad, barrio, presentación, categorías en las que ayudás, WhatsApp (opcional), tus pedidos, ofrecimientos, presentaciones, intercambios, avales, grupos, mensajes de chat, reportes, bloqueos, notificaciones y preferencias de avisos. Email para iniciar sesión y para avisos (si los activás).'],
  ['1b. Documentos de verificación', 'Si pedís verificarte, guardamos temporalmente una foto de tu documento, una selfie y, si corresponde, tu certificado de antecedentes, en un almacenamiento privado al que solo accede el equipo de revisión. Se borran apenas se toma la decisión; solo conservamos el resultado (verificado o no).'],
  ['2. Para qué', 'Para mostrarte pedidos de tu ciudad, recomendarte personas de confianza y permitir presentaciones. No vendemos tus datos.'],
  ['3. Tu teléfono', 'Tu WhatsApp y tu email nunca se muestran en público. El WhatsApp solo lo ve un amigo tuyo en Che o alguien con quien ambos aceptaron una presentación.'],
  ['4. Dónde se guardan', 'En servidores de Supabase en la región São Paulo (Brasil). Los emails se envían a través de Resend y las notificaciones push a través del servicio de tu navegador (Google, Apple o Mozilla).'],
  ['5. Tus derechos', 'Podés acceder, rectificar y suprimir tus datos (Ley 18.331 de Uruguay; Ley 25.326 de Argentina). Borrar tu cuenta elimina todos tus datos de forma permanente.'],
  ['6. Contacto', 'hola@checonoces.com (a confirmar).'],
];

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const sections = kind === 'terms' ? TERMS : PRIVACY;
  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="h-14 bg-card shadow-card flex items-center px-4 gap-3">
        <Link to="/" className="text-xl font-bold text-brand">che</Link>
        <span className="font-semibold">{t(kind === 'terms' ? 'legal.terms_title' : 'legal.privacy_title')}</span>
      </header>
      <main className="grow flex justify-center px-0 sm:px-4 py-4">
        <article className="card w-full max-w-[720px] p-4 sm:p-6 space-y-4">
          <h1 className="text-2xl font-bold">{t(kind === 'terms' ? 'legal.terms_title' : 'legal.privacy_title')}</h1>
          <p className="flex gap-2 rounded-lg bg-soon-bg text-soon p-3 text-sm font-medium">
            <AlertTriangle size={18} className="shrink-0" /> {t('legal.draft')}
          </p>
          {sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="font-bold mb-1">{h}</h2>
              <p className="text-[15px] leading-relaxed">{body}</p>
            </section>
          ))}
          <p className="text-xs text-ink-2">Versión borrador · octubre 2026</p>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
