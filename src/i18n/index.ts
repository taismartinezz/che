import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es';
import en from './en';
import { mvp2Es, mvp2En } from './mvp2';
import ayudaEs from './ayuda.es';
import ayudaEn from './ayuda.en';

const LANG_KEY = 'che-lang';

/**
 * Spanish by default. English only if the user picked it, or if they never
 * picked a language and their browser language starts with "en".
 */
function initialLanguage(): 'es' | 'en' {
  let chosen: string | null = null;
  try {
    chosen = localStorage.getItem(LANG_KEY);
  } catch {
    /* ignore */
  }
  if (chosen === 'es' || chosen === 'en') return chosen;
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: { ...es, ayuda: ayudaEs, mvp2: mvp2Es } }, en: { translation: { ...en, ayuda: ayudaEn, mvp2: mvp2En } } },
  lng: initialLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});
document.documentElement.lang = i18n.language;

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

/** An explicit choice by the user: remembered on this device. */
export function setLanguage(lng: 'es' | 'en') {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    /* ignore */
  }
  i18n.changeLanguage(lng);
}

export default i18n;
