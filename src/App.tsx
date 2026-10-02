import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { DataProvider, useData } from './context/DataContext';
import { FullScreenLoader } from './components/States';
import { isConfigured, supabase } from './lib/supabase';
import { api } from './lib/api';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import RequestPage from './pages/RequestPage';
import Network from './pages/Network';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import Roadmap from './pages/Roadmap';
import SoonPage from './pages/SoonPage';
import Chat from './pages/Chat';
import Groups from './pages/Groups';
import GroupPage from './pages/GroupPage';
import Notifications from './pages/Notifications';
import Legal from './pages/Legal';
import { INVITE_KEY, Invite, NotFound, Setup } from './pages/Misc';

/** Redeems a stored invite code once the user has finished onboarding. */
function InviteRedeemer() {
  const { profile } = useAuth();
  const { refreshNetwork } = useData();
  const { toast } = useUI();
  const { t } = useTranslation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!profile?.onboarded) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(INVITE_KEY);
      localStorage.removeItem(INVITE_KEY);
    } catch {
      /* ignore */
    }
    if (!code || code === profile.invite_code) return;
    api
      .acceptInvite(code)
      .then(async (inviter) => {
        if (!inviter) return;
        await refreshNetwork();
        const { data } = await supabase.from('profiles').select('display_name').eq('id', inviter).maybeSingle();
        toast(t('network.invite_connected', { name: data?.display_name ?? '' }));
        navigate('/red');
      })
      .catch(() => undefined);
  }, [profile?.onboarded, profile?.invite_code, refreshNetwork, toast, t, navigate]);
  return null;
}

const NEXT_KEY = 'che-next';

/** Remembers a deep link (e.g. a shared /pedido/… link) while signed out. */
function RememberAndLogin() {
  const location = useLocation();
  try {
    if (location.pathname !== '/' && location.pathname !== '/login') {
      sessionStorage.setItem(NEXT_KEY, location.pathname + location.search);
    }
  } catch {
    /* ignore */
  }
  return <Navigate to="/login" replace />;
}

/** After sign-in + onboarding, go back to the remembered deep link once. */
function ReturnToDeepLink() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const next = sessionStorage.getItem(NEXT_KEY);
      if (next) {
        sessionStorage.removeItem(NEXT_KEY);
        navigate(next, { replace: true });
      }
    } catch {
      /* ignore */
    }
  }, [navigate]);
  return null;
}

/** Keeps profiles.locale in sync so emails and push go out in the user's language. */
function LocaleSync() {
  const { profile } = useAuth();
  const { i18n } = useTranslation();
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('profiles').update({ locale: i18n.language === 'en' ? 'en' : 'es' }).eq('id', profile.id).then(() => undefined);
  }, [profile?.id, i18n.language]);
  return null;
}

function AppRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  const legal = [
    <Route key="t" path="/terminos" element={<Legal kind="terms" />} />,
    <Route key="p" path="/privacidad" element={<Legal kind="privacy" />} />,
    <Route key="i" path="/invite/:code" element={<Invite />} />,
  ];

  if (!session)
    return (
      <Routes>
        {legal}
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<RememberAndLogin />} />
      </Routes>
    );

  if (!profile) return <FullScreenLoader />;

  if (!profile.onboarded)
    return (
      <Routes>
        {legal}
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );

  return (
    <>
      <InviteRedeemer />
      <ReturnToDeepLink />
      <LocaleSync />
      <Routes>
        {legal}
        <Route path="/" element={<Feed />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/pedido/:id" element={<RequestPage />} />
        <Route path="/red" element={<Network />} />
        <Route path="/grupos" element={<Groups />} />
        <Route path="/grupos/:id" element={<GroupPage />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/pagos" element={<SoonPage feature="payments" />} />
        <Route path="/hoja-de-ruta" element={<Roadmap />} />
        <Route path="/perfil/:id" element={<Profile />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/notificaciones" element={<Notifications />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default function App() {
  if (!isConfigured)
    return (
      <Routes>
        <Route path="/terminos" element={<Legal kind="terms" />} />
        <Route path="/privacidad" element={<Legal kind="privacy" />} />
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  return (
    <UIProvider>
      <DataProvider>
        <AppRoutes />
      </DataProvider>
    </UIProvider>
  );
}
