import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ProfileForm from '../components/ProfileForm';
import { PublicFooter } from './Login';
import { markWelcomePending } from '../lib/firstRun';

export default function Onboarding() {
  const { t } = useTranslation();
  const { profile, priv, refreshProfile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="h-14 bg-card shadow-card flex items-center justify-between px-4">
        <div className="text-xl font-bold text-brand">che</div>
        <button className="btn-ghost" onClick={signOut}>{t('nav.sign_out')}</button>
      </header>
      <main className="grow flex justify-center px-0 sm:px-4 py-4 sm:py-8">
        <div className="card w-full max-w-[560px] p-4 sm:p-6">
          <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>
          <p className="text-ink-2 mb-5">{t('onboarding.subtitle')}</p>
          <ProfileForm
            profile={profile}
            whatsapp={priv.contact_whatsapp}
            submitLabel={t('onboarding.submit')}
            requireTerms
            onSaved={() => {
              markWelcomePending();
              refreshProfile();
            }}
          />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
