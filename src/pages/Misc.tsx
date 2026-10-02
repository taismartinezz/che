import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { PublicFooter } from './Login';

export const INVITE_KEY = 'che-invite';

/** /invite/:code — remember the code; it is redeemed right after onboarding (see App). */
export function Invite() {
  const { code = '' } = useParams();
  const { session } = useAuth();
  useEffect(() => {
    try {
      localStorage.setItem(INVITE_KEY, code.toUpperCase());
    } catch {
      /* ignore */
    }
  }, [code]);
  return <Navigate to={session ? '/red' : '/login'} replace />;
}

export function Setup() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="grow flex items-center justify-center p-4">
        <div className="card p-6 max-w-lg space-y-3">
          <div className="text-2xl font-bold text-brand">che</div>
          <h1 className="text-xl font-bold">{t('auth.setup_title')}</h1>
          <p className="text-[15px]">{t('auth.setup_body')}</p>
          <pre className="bg-field rounded p-3 text-xs overflow-x-auto">
            VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=eyJ…
          </pre>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card p-8 text-center space-y-3">
        <h1 className="text-xl font-bold">{t('errors.not_found')}</h1>
        <Link to="/" className="btn-primary">{t('nav.back_home')}</Link>
      </div>
    </div>
  );
}
