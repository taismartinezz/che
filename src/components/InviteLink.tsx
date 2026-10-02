import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { shareLink } from '../lib/share';

export function inviteUrl(code: string) {
  return `${window.location.origin}/invite/${code}`;
}

export default function InviteLink({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast } = useUI();
  const url = inviteUrl(me.invite_code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('network.copied'));
    } catch {
      window.prompt(t('network.copy_link'), url);
    }
  };
  if (compact)
    return (
      <button className="btn-secondary w-full" onClick={copy}>
        <Link2 size={18} /> {t('network.copy_link')}
      </button>
    );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} className="input font-mono text-sm" onFocus={(e) => e.currentTarget.select()} aria-label={t('settings.invite')} />
        <button className="btn-secondary shrink-0" onClick={copy}>
          <Link2 size={18} /> {t('common.copy')}
        </button>
      </div>
      <button className="btn-primary w-full sm:w-auto" onClick={() => shareLink(t('share.invite_text'), url)}>
        {t('share.whatsapp')}
      </button>
    </div>
  );
}
