import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import RichText from '../components/RichText';

export function PublicFooter() {
  const { t, i18n } = useTranslation();
  return (
    <footer className="text-xs text-ink-2 text-center py-6 space-x-3">
      <button className="hover:underline" onClick={() => i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')}>
        {i18n.language === 'es' ? 'English' : 'Español'}
      </button>
      <Link to="/terminos" className="hover:underline">{t('nav.terms')}</Link>
      <Link to="/privacidad" className="hover:underline">{t('nav.privacy')}</Link>
      <span>Che © 2026</span>
    </footer>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invited = (() => {
    try {
      return Boolean(localStorage.getItem('che-invite'));
    } catch {
      return false;
    }
  })();

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setSent(true);
  };

  const google = async () => {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(friendlyError(err));
  };

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <div className="grow flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[980px] grid wide:grid-cols-2 gap-8 wide:gap-16 items-center">
          <div className="text-center wide:text-left">
            <div className="text-3xl font-bold text-brand mb-3">che</div>
            <h1 className="text-2xl wide:text-3xl font-semibold leading-tight">{t('auth.welcome_title')}</h1>
            <p className="text-ink-2 wide:text-lg mt-2">{t('auth.welcome_body')}</p>
          </div>

          <div className="w-full max-w-[400px] mx-auto">
            {invited && <div className="card p-3 mb-3 text-sm">{t('auth.invited')}</div>}
            <div className="card p-4 space-y-3">
              {sent ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-[17px]">{t('auth.link_sent', { email })}</p>
                  <button className="btn-ghost" onClick={() => setSent(false)}>{t('common.cancel')}</button>
                </div>
              ) : (
                <>
                  <form onSubmit={sendLink} className="space-y-3">
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      className="input h-11"
                      placeholder={t('auth.email')}
                      aria-label={t('auth.email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <button className="btn-primary w-full h-11" disabled={busy}>
                      {t('auth.send_link')}
                    </button>
                  </form>
                  <p className="text-center text-sm text-ink-2">{t('auth.no_password')}</p>
                  <div className="flex items-center gap-3 text-ink-2 text-sm">
                    <hr className="grow border-divider" /> {t('auth.or')} <hr className="grow border-divider" />
                  </div>
                  <button className="btn-secondary w-full h-11" onClick={google}>
                    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                    </svg>
                    {t('auth.google')}
                  </button>
                </>
              )}
              {error && <p className="text-danger text-sm text-center" role="alert">{error}</p>}
              <p className="text-xs text-ink-2 text-center">
                <RichText i18nKey="auth.legal" />
              </p>
            </div>
            <p className="text-center text-sm mt-4 text-ink-2">{t('app.disclaimer')}</p>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
