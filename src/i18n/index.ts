/** i18next initialization with English fallback and on-demand locale chunks. */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

const localeLoaders = {
  zh: () => import('./locales/zh.json'),
  ja: () => import('./locales/ja.json'),
  es: () => import('./locales/es.json'),
  vi: () => import('./locales/vi.json'),
  id: () => import('./locales/id.json'),
  ms: () => import('./locales/ms.json'),
  fr: () => import('./locales/fr.json'),
  hi: () => import('./locales/hi.json'),
} as const;

type LazyLocale = keyof typeof localeLoaders;
type Locale = 'en' | LazyLocale;
const isLocale = (value: string): value is Locale => value === 'en' || value in localeLoaders;
const requested = localStorage.getItem('kl:lang') || 'en';
const initialLocale: Locale = isLocale(requested) ? requested : 'en';
const resources: Record<string, { translation: typeof en }> = { en: { translation: en } };

if (initialLocale !== 'en') {
  resources[initialLocale] = { translation: (await localeLoaders[initialLocale]()).default };
}

await i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function changeLanguage(code: string): Promise<void> {
  if (!isLocale(code)) return;
  if (code !== 'en' && !i18n.hasResourceBundle(code, 'translation')) {
    const locale = (await localeLoaders[code]()).default;
    i18n.addResourceBundle(code, 'translation', locale, true, true);
  }
  await i18n.changeLanguage(code);
  localStorage.setItem('kl:lang', code);
}

export default i18n;
