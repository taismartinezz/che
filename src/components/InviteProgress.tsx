import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { INVITE_GOAL, whatsappShareUrl } from '../lib/share';
import { inviteUrl } from './InviteLink';

/** "1 de 3 amigos se sumaron" + bar. */
export function InviteBar() {
  const { t } = useTranslation();
  const { friends } = useData();
  const n = Math.min(friends.length, INVITE_GOAL);
  return (
    <div>
      <div className="h-2 rounded-full bg-field overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={INVITE_GOAL} aria-valuenow={n}>
        <div className="h-full bg-brand transition-all" style={{ width: `${(n / INVITE_GOAL) * 100}%` }} />
      </div>
      <p className="text-sm text-ink-2 mt-1">{t('welcome.progress', { count: n })}</p>
    </div>
  );
}

/** One-tap WhatsApp share of the invite link, plus copy. */
export function InviteButtons({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast } = useUI();
  const url = inviteUrl(me.invite_code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('welcome.copied'));
    } catch {
      window.prompt(t('welcome.copy'), url);
    }
  };
  return (
    <div className={`flex gap-2 ${compact ? 'flex-wrap' : 'flex-col sm:flex-row'}`}>
      <a
        className={`btn-primary whitespace-nowrap ${compact ? 'h-8 text-sm grow' : 'h-11 grow'}`}
        href={whatsappShareUrl(`${t('welcome.message')} ${url}`)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('welcome.share_whatsapp')}
      </a>
      <button className={`btn-secondary whitespace-nowrap ${compact ? 'h-8 text-sm grow sm:grow-0' : 'h-11'}`} onClick={copy}>
        <Link2 size={compact ? 16 : 18} /> {t('welcome.copy')}
      </button>
    </div>
  );
}

/** Slim card shown on the feed while the user has fewer than 3 friends. */
export function InviteCard() {
  const { t } = useTranslation();
  const { friends, networkLoading } = useData();
  if (networkLoading || friends.length >= INVITE_GOAL) return null;
  return (
    <section className="card p-3 space-y-2 border-brand/40">
      <div>
        <h2 className="font-semibold">{t('welcome.card_title')}</h2>
        <p className="text-sm text-ink-2">{t('welcome.card_body')}</p>
      </div>
      <InviteBar />
      <InviteButtons compact />
    </section>
  );
}
