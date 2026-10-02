import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, FileText, Map as MapIcon, Settings, Shield, Users, UsersRound, Wallet, Briefcase } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import type { SoonFeature } from '../lib/constants';
import Avatar from './Avatar';
import { SoonTag } from './ComingSoonDialog';

function Item({ to, icon, label, soon }: { to?: string; icon: ReactNode; label: string; soon?: SoonFeature }) {
  const { showSoon } = useUI();
  const body = (
    <>
      <span className="h-9 w-9 rounded-full bg-brand-soft text-brand flex items-center justify-center shrink-0">{icon}</span>
      <span className="grow truncate">{label}</span>
      {soon && <SoonTag />}
    </>
  );
  if (to)
    return (
      <Link to={to} className="side-link">
        {body}
      </Link>
    );
  return (
    <button className="side-link" onClick={() => soon && showSoon(soon)}>
      {body}
    </button>
  );
}

export default function LeftSidebar() {
  const { t } = useTranslation();
  const { me, priv } = useMe();
  return (
    <nav className="px-2 space-y-0.5">
      <Link to={`/perfil/${me.id}`} className="side-link">
        <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={36} />
        <span className="truncate font-semibold">{me.display_name}</span>
      </Link>
      <Item to="/red" icon={<Users size={20} />} label={t('nav.network')} />
      <Item to="/grupos" icon={<UsersRound size={20} />} label={t('nav.groups')} soon="groups" />
      <Item to="/pagos" icon={<Wallet size={20} />} label={t('nav.payments')} soon="payments" />
      <Item to="/hoja-de-ruta" icon={<MapIcon size={20} />} label={t('nav.roadmap')} />
      <Item to="/ajustes" icon={<Settings size={20} />} label={t('nav.settings')} />
      {priv.is_admin && <Item to="/admin" icon={<Shield size={20} />} label={t('nav.admin')} />}
      <hr className="border-divider my-3 mx-2" />
      <Item icon={<BadgeCheck size={20} />} label={t('soon.features.verification.title')} soon="verification" />
      <Item icon={<Briefcase size={20} />} label={t('soon.features.registered_worker.title')} soon="registered_worker" />
      <Item icon={<FileText size={20} />} label={t('soon.features.invoices.title')} soon="invoices" />
      <p className="px-2 pt-4 text-xs text-ink-2 leading-relaxed">
        <Link to="/terminos" className="hover:underline">{t('nav.terms')}</Link> ·{' '}
        <Link to="/privacidad" className="hover:underline">{t('nav.privacy')}</Link> · Che © 2026
        <br />
        {t('app.disclaimer')}
      </p>
    </nav>
  );
}
