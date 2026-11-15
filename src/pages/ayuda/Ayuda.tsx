import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Lightbulb, MessageSquareWarning, Wrench } from 'lucide-react';
import { AyudaShell } from '../../components/ayuda/ui';
import { useAuth } from '../../context/AuthContext';
import { rememberNextPath } from '../../lib/firstRun';

const OPTIONS = [
  { key: 'reclamo', to: '/ayuda/reclamo', icon: MessageSquareWarning },
  { key: 'reporte', to: '/ayuda/reporte', icon: Wrench },
  { key: 'sugerencia', to: '/ayuda/sugerencia', icon: Lightbulb },
] as const;

export default function Ayuda() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const signedIn = Boolean(profile?.onboarded);
  const faq = t('ayuda.faq', { returnObjects: true }) as { q: string; a: string }[];

  return (
    <AyudaShell>
      <section className="card p-4">
        <h1 className="text-2xl font-semibold">{t('ayuda.title')}</h1>
        <p className="text-ink-2 mt-1">{t('ayuda.intro')}</p>
      </section>

      <nav aria-label={t('ayuda.title')} className="space-y-2">
        {OPTIONS.map(({ key, to, icon: Icon }) => (
          <Link
            key={key}
            to={signedIn ? to : '/login'}
            onClick={() => !signedIn && rememberNextPath(to)}
            className="card flex items-center gap-4 p-4 min-h-[76px] hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className="h-12 w-12 rounded-full bg-brand-soft text-brand flex items-center justify-center shrink-0">
              <Icon size={24} aria-hidden />
            </span>
            <span className="grow min-w-0">
              <span className="block font-semibold text-[17px] leading-snug">{t(`ayuda.options.${key}.title`)}</span>
              <span className="block text-sm text-ink-2">{t(`ayuda.options.${key}.desc`)}</span>
            </span>
            <ChevronRight size={20} className="text-ink-2 shrink-0" aria-hidden />
          </Link>
        ))}
      </nav>

      {signedIn && (
        <Link to="/ayuda/mis-reclamos" className="btn-secondary w-full h-11">
          {t('ayuda.mis_reclamos')}
        </Link>
      )}
      {!signedIn && <p className="text-sm text-ink-2 text-center">{t('ayuda.login_needed')}</p>}

      <section className="card p-4">
        <h2 className="font-semibold mb-2">{t('ayuda.faq_title')}</h2>
        <div className="divide-y divide-divider">
          {faq.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 py-2 font-medium rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                {f.q}
                <ChevronRight size={18} className="text-ink-2 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <p className="text-[15px] text-ink-2 pb-3 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </AyudaShell>
  );
}
