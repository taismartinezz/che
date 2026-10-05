import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CityCode, SoonFeature } from '../lib/constants';
import { friendlyError } from '../lib/errors';
import ComingSoonDialog from '../components/ComingSoonDialog';
import { useAuth } from './AuthContext';

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

interface UIState {
  dark: boolean;
  toggleDark: () => void;
  viewCity: CityCode;
  setViewCity: (c: CityCode) => void;
  showSoon: (f: SoonFeature) => void;
  toast: (text: string) => void;
  toastError: (err: unknown) => void;
}

const UIContext = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [viewCity, setViewCityState] = useState<CityCode>('mvd');
  const [soon, setSoon] = useState<SoonFeature | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (profile?.city) setViewCityState(profile.city);
  }, [profile?.city]);

  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('che-theme', next ? 'dark' : 'light');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const push = useCallback((text: string, kind: Toast['kind']) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);

  // Stable functions: screens use toast/toastError in effect dependencies, so a
  // new function on every render would make them reload (and close dialogs).
  const toast = useCallback((text: string) => push(text, 'ok'), [push]);
  const toastError = useCallback(
    (err: unknown) => {
      console.error(err);
      push(friendlyError(err), 'error');
    },
    [push],
  );
  const value = useMemo<UIState>(
    () => ({ dark, toggleDark, viewCity, setViewCity: setViewCityState, showSoon: setSoon, toast, toastError }),
    [dark, toggleDark, viewCity, toast, toastError],
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <ComingSoonDialog feature={soon} onClose={() => setSoon(null)} />
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-[min(92vw,420px)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((x) => (
          <div
            key={x.id}
            role={x.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full rounded-lg px-4 py-3 text-[15px] shadow-pop ${
              x.kind === 'error' ? 'bg-danger text-white' : 'bg-ink text-page'
            }`}
          >
            {x.text}
          </div>
        ))}
      </div>
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI outside UIProvider');
  return ctx;
}
