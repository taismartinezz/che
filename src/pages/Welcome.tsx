import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { InviteBar, InviteButtons } from '../components/InviteProgress';
import { INVITE_GOAL } from '../lib/share';
import { inviteUrl } from '../components/InviteLink';
import { useMe } from '../context/AuthContext';
import { takeNextPath } from '../lib/firstRun';

/** First-run step after onboarding: invite 3 people you trust. Skippable. */
export default function Welcome() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { friends } = useData();
  const navigate = useNavigate();
  const done = friends.length >= INVITE_GOAL;
  const leave = () => navigate(takeNextPath() ?? '/', { replace: true });

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="h-14 bg-card border-b border-divider flex items-center px-4">
        <span className="text-xl font-bold text-brand">che</span>
      </header>
      <main className="grow flex justify-center px-4 py-6 sm:py-10">
        <div className="card w-full max-w-[520px] p-5 sm:p-6 space-y-4 self-start">
          <h1 className="text-2xl font-semibold leading-tight">{t('welcome.title')}</h1>
          <p className="text-ink-2">{t('welcome.body')}</p>
          <InviteBar />
          <InviteButtons />
          <p className="text-xs text-ink-2 break-all font-mono">{inviteUrl(me.invite_code)}</p>
          <div className="pt-2 border-t border-divider flex justify-end">
            {done ? (
              <button className="btn-primary" onClick={leave}>{t('welcome.done')}</button>
            ) : (
              <button className="btn-ghost text-brand" onClick={leave}>{t('welcome.skip')}</button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
