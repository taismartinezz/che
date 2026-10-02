import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es';
import en from './en';

const saved = (() => {
  try {
    return localStorage.getItem('che-lang');
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: saved === 'en' ? 'en' : 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem('che-lang', lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
