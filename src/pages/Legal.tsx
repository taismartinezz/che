import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { PublicFooter } from './Login';
import { legalEs, legalEn } from '../i18n/legal';

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { t, i18n } = useTranslation();
  const copy = i18n.language.startsWith('en') ? legalEn : legalEs;
  const sections = copy[kind];
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
          <p className="text-xs text-ink-2">{copy.version}</p>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
