import { useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Check,
  Home,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Moon,
  Search,
  Settings,
  Shield,
  Users,
  UsersRound,
  Wallet,
  ArrowLeft,
} from 'lucide-react';
import { useAuth, useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useData } from '../context/DataContext';
import { CITIES } from '../lib/constants';
import { useClickOutside } from '../hooks/useClickOutside';
import Avatar from './Avatar';
import { setLanguage } from '../i18n';
import NotificationList from './NotificationList';

export const TABS = [
  { to: '/', icon: Home, key: 'nav.home', end: true },
  { to: '/red', icon: Users, key: 'nav.network' },
  { to: '/grupos', icon: UsersRound, key: 'nav.groups' },
  { to: '/pagos', icon: Wallet, key: 'nav.payments' },
  { to: '/hoja-de-ruta', icon: MapIcon, key: 'nav.roadmap' },
];

function Logo() {
  return (
    <Link
      to="/"
      aria-label="Che, ¿conocés?"
      className="h-10 w-10 rounded-full bg-brand-fill text-white flex items-center justify-center font-extrabold text-[15px] tracking-tight shrink-0 hover:bg-brand-fill-hover"
    >
      che
    </Link>
  );
}

function Popover({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className={`fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-14 sm:top-full sm:mt-2 z-50 card shadow-pop p-2 ${className}`}>
      {children}
    </div>
  );
}

function TabLink({ tab, compact }: { tab: (typeof TABS)[number]; compact?: boolean }) {
  const { t } = useTranslation();
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      title={t(tab.key)}
      aria-label={t(tab.key)}
      className={({ isActive }) =>
        `relative flex-1 flex items-center justify-center ${compact ? 'h-12' : 'h-14 max-w-[112px]'} group ${
          isActive ? 'text-brand' : 'text-ink-2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex items-center justify-center w-full ${compact ? 'h-10' : 'h-12'} mx-1 rounded-lg ${
              isActive ? '' : 'group-hover:bg-hover'
            }`}
          >
            <Icon size={compact ? 22 : 24} strokeWidth={isActive ? 2.2 : 1.8} />
          </span>
          {isActive && <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand rounded-t" />}
        </>
      )}
    </NavLink>
  );
}

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const { me, priv } = useMe();
  const { signOut } = useAuth();
  const { dark, toggleDark, viewCity, setViewCity } = useUI();
  const { unread, markAllRead, unreadMessages } = useData();
  const navigate = useNavigate();
  const location = useLocation();

  const [openMenu, setOpenMenu] = useState<null | 'city' | 'notif' | 'account'>(null);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const rightRef = useRef<HTMLDivElement>(null);
  useClickOutside(rightRef, openMenu !== null, () => setOpenMenu(null));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMobileSearch(false);
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  const toggle = (m: 'city' | 'notif' | 'account') => {
    setOpenMenu((cur) => (cur === m ? null : m));
    if (m === 'notif' && openMenu !== 'notif' && unread > 0) setTimeout(markAllRead, 1500);
  };

  const searchInput = (autoFocus = false) => (
    <form onSubmit={submitSearch} className="relative grow" role="search">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" />
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('nav.search')}
        aria-label={t('nav.search')}
        className="h-10 w-full rounded-full bg-field pl-9 pr-3 text-[15px] placeholder:text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
    </form>
  );

  return (
    <header className="sticky top-0 z-40 bg-card border-b border-divider">
      <div className="h-14 px-2 sm:px-4 flex items-center gap-2">
        {/* Left: logo + search */}
        {mobileSearch ? (
          <div className="flex items-center gap-2 w-full xl3:hidden">
            <button className="icon-btn bg-transparent" onClick={() => setMobileSearch(false)} aria-label={t('common.close')}>
              <ArrowLeft size={20} />
            </button>
            {searchInput(true)}
          </div>
        ) : null}
        <div className={`flex items-center gap-2 shrink-0 wide:w-[280px] xl3:w-[320px] ${mobileSearch ? 'hidden xl3:flex' : ''}`}>
          <Logo />
          <div className="hidden xl3:block w-[240px]">{searchInput()}</div>
          <button className="icon-btn xl3:hidden" onClick={() => setMobileSearch(true)} aria-label={t('nav.search')}>
            <Search size={20} />
          </button>
        </div>

        {/* Centre: tabs (desktop) */}
        <nav className={`hidden wide:flex grow justify-center items-stretch h-14 max-w-[600px] mx-auto ${mobileSearch ? '!hidden xl3:!flex' : ''}`}>
          {TABS.map((tab) => (
            <TabLink key={tab.to} tab={tab} />
          ))}
        </nav>

        {/* Right: round buttons */}
        <div
          ref={rightRef}
          className={`ml-auto flex items-center gap-1.5 sm:gap-2 justify-end wide:w-[280px] xl3:w-[320px] ${mobileSearch ? 'hidden xl3:flex' : ''}`}
        >
          <div className="relative">
            <button className="icon-btn h-9 w-9 sm:h-10 sm:w-10" onClick={() => toggle('city')} title={t('nav.city')} aria-label={t('nav.city')}>
              <MapPin size={19} />
            </button>
            <Popover open={openMenu === 'city'} className="sm:w-64">
              <p className="px-2 py-1 font-semibold">{t('nav.city')}</p>
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  className="side-link justify-between"
                  onClick={() => {
                    setViewCity(c.id);
                    setOpenMenu(null);
                    if (location.pathname !== '/') navigate('/');
                  }}
                >
                  {t(`cities.${c.id}`)} {viewCity === c.id && <Check size={18} className="text-brand" />}
                </button>
              ))}
            </Popover>
          </div>
          <button
            className="icon-btn h-9 w-9 sm:h-10 sm:w-10 text-[13px] font-bold"
            onClick={() => setLanguage(i18n.language === 'es' ? 'en' : 'es')}
            title={t('nav.language')}
            aria-label={t('nav.language')}
          >
            {i18n.language === 'es' ? 'ES' : 'EN'}
          </button>
          <Link to="/chat" className="icon-btn h-9 w-9 sm:h-10 sm:w-10 relative" title={t('nav.chat')} aria-label={t('nav.chat')}>
            <MessageCircle size={19} />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </Link>
          <div className="relative">
            <button
              className={`icon-btn h-9 w-9 sm:h-10 sm:w-10 relative ${openMenu === 'notif' ? 'bg-brand-soft text-brand' : ''}`}
              onClick={() => toggle('notif')}
              title={t('nav.notifications')}
              aria-label={t('nav.notifications')}
            >
              <Bell size={19} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <Popover open={openMenu === 'notif'} className="sm:w-[360px] max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-2xl font-bold">{t('notifications.title')}</p>
                <Link to="/notificaciones" className="text-brand text-sm hover:underline" onClick={() => setOpenMenu(null)}>
                  {t('notifications.see_all')}
                </Link>
              </div>
              <NotificationList limit={12} onNavigate={() => setOpenMenu(null)} />
            </Popover>
          </div>
          <div className="relative">
            <button className="rounded-full hover:brightness-95" onClick={() => toggle('account')} aria-label={t('nav.account')}>
              <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={40} />
            </button>
            <Popover open={openMenu === 'account'} className="sm:w-[340px]">
              <Link to={`/perfil/${me.id}`} onClick={() => setOpenMenu(null)} className="flex items-center gap-3 p-2 mb-1 rounded-lg hover:bg-hover border-b border-divider">
                <Avatar id={me.id} name={me.display_name} url={me.avatar_url} size={40} />
                <div>
                  <div className="font-semibold">{me.display_name}</div>
                  <div className="text-sm text-ink-2">{t('nav.profile')}</div>
                </div>
              </Link>
              <MenuRow icon={<Settings size={20} />} label={t('nav.settings')} onClick={() => { setOpenMenu(null); navigate('/ajustes'); }} />
              <MenuRow icon={<Moon size={20} />} label={t('nav.dark_mode')} onClick={toggleDark} right={<Switch on={dark} />} />
              {priv.is_admin && (
                <MenuRow icon={<Shield size={20} />} label={t('nav.admin')} onClick={() => { setOpenMenu(null); navigate('/admin'); }} />
              )}
              <MenuRow icon={<LogOut size={20} />} label={t('nav.sign_out')} onClick={signOut} />
              <p className="px-2 pt-2 text-xs text-ink-2">
                <Link to="/terminos" className="hover:underline">{t('nav.terms')}</Link> ·{' '}
                <Link to="/privacidad" className="hover:underline">{t('nav.privacy')}</Link> · Che © 2026
              </p>
            </Popover>
          </div>
        </div>
      </div>

      {/* Tabs under the bar on phones/tablets */}
      <nav className="wide:hidden flex border-t border-divider">
        {TABS.map((tab) => (
          <TabLink key={tab.to} tab={tab} compact />
        ))}
      </nav>
      {mobileSearch && <button className="fixed inset-0 top-14 -z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setMobileSearch(false)} />}
    </header>
  );
}

function MenuRow({ icon, label, onClick, right }: { icon: ReactNode; label: string; onClick: () => void; right?: ReactNode }) {
  return (
    <button className="side-link" onClick={onClick}>
      <span className="text-ink-2">{icon}</span>
      <span className="grow">{label}</span>
      {right}
    </button>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${on ? 'bg-brand-fill' : 'bg-divider'}`} aria-hidden>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  );
}

