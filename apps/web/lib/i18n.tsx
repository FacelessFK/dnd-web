'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const locales = ['en', 'fa'] as const;

export type Locale = (typeof locales)[number];

const localeStorageKey = 'dnd-web.locale';
const defaultLocale: Locale = 'fa';

const messages = {
  en: {
    'app.brand': 'DND Web',
    'common.characters': 'Characters',
    'common.dashboard': 'Dashboard',
    'common.language': 'Language',
    'common.ready': 'Ready',
    'common.server': 'Server',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'home.card.characters.description':
      'Browse saved heroes and export sheets.',
    'home.card.characters.title': 'Character Library',
    'home.card.runtime.description':
      'Create sessions, recover state, and drive encounters.',
    'home.card.runtime.title': 'Runtime War Table',
    'home.card.server.description': 'Check the local backend directly.',
    'home.card.server.title': 'Server Status',
    'home.eyebrow': 'Browser runtime and character tools',
    'home.intro':
      'Run sessions, manage characters, and inspect the live tabletop from one practical workspace. Pick the surface you need and keep moving.',
    'home.title': 'D&D DM-Driven Platform',
    'nav.campaigns': 'Campaigns',
    'nav.characterLibrary': 'Character Library',
    'nav.characterWorkspace': 'Character workspace',
    'nav.compendium': 'Compendium',
    'nav.journal': 'Journal',
    'nav.runtimeTable': 'Runtime Table',
    'nav.soon': 'Soon',
    'page.characterBuilder.title': 'Character Builder',
    'page.characterLibrary.title': 'Character Library',
    'runtime.eyebrow': 'Authoritative table surface',
    'runtime.mode.dm': 'DM Mode',
    'runtime.mode.player': 'Player Mode',
    'runtime.nav.characters': 'Characters',
    'runtime.status.busy': 'Busy: {label}',
    'runtime.status.stream': 'Stream {status}',
    'runtime.status.streamIdle': 'Stream idle',
    'runtime.summary':
      'A role-aware browser surface for the existing backend. The server still owns truth; SSE is live-only, and recovery rebuilds state from read models.',
    'runtime.title': 'Runtime War Table',
    'shell.builderMvp.body':
      'Persisted character library entries with DB-mode development ownership. Production account security is intentionally pending.',
    'shell.builderMvp.title': 'Builder MVP',
    'shell.characterTools': 'Character tools',
    'shell.demoProfile': 'Demo Profile',
  },
  fa: {
    'app.brand': 'DND Web',
    'common.characters': 'کاراکترها',
    'common.dashboard': 'داشبورد',
    'common.language': 'زبان',
    'common.ready': 'آماده',
    'common.server': 'سرور',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'home.card.characters.description':
      'قهرمان‌های ذخیره‌شده را ببینید و شیت خروجی بگیرید.',
    'home.card.characters.title': 'کتابخانه کاراکترها',
    'home.card.runtime.description':
      'جلسه بسازید، وضعیت را بازیابی کنید و برخوردها را از میز بازی پیش ببرید.',
    'home.card.runtime.title': 'میز نبرد زنده',
    'home.card.server.description': 'بک‌اند محلی را مستقیم بررسی کنید.',
    'home.card.server.title': 'وضعیت سرور',
    'home.eyebrow': 'میز زنده مرورگر و ابزارهای کاراکتر',
    'home.intro':
      'جلسه‌ها را اجرا کنید، کاراکترها را مدیریت کنید و میز بازی زنده را از یک محیط کاری کاربردی ببینید. بخش مورد نیازتان را انتخاب کنید و ادامه دهید.',
    'home.title': 'پلتفرم D&D با هدایت DM',
    'nav.campaigns': 'کمپین‌ها',
    'nav.characterLibrary': 'کتابخانه کاراکترها',
    'nav.characterWorkspace': 'محیط کاراکتر',
    'nav.compendium': 'دانش‌نامه',
    'nav.journal': 'ژورنال',
    'nav.runtimeTable': 'میز زنده',
    'nav.soon': 'به‌زودی',
    'page.characterBuilder.title': 'سازنده کاراکتر',
    'page.characterLibrary.title': 'کتابخانه کاراکترها',
    'runtime.eyebrow': 'سطح کنترل مرجع برای میز بازی',
    'runtime.mode.dm': 'حالت DM',
    'runtime.mode.player': 'حالت بازیکن',
    'runtime.nav.characters': 'کاراکترها',
    'runtime.status.busy': 'درگیر: {label}',
    'runtime.status.stream': 'استریم {status}',
    'runtime.status.streamIdle': 'استریم غیرفعال',
    'runtime.summary':
      'یک سطح مرورگری متناسب با نقش کاربر برای بک‌اند فعلی. وضعیت نهایی همچنان دست سرور است؛ SSE فقط رویدادهای زنده را می‌رساند و بازیابی، وضعیت را از مدل‌های خواندنی بازسازی می‌کند.',
    'runtime.title': 'میز نبرد زنده',
    'shell.builderMvp.body':
      'ورودی‌های کتابخانه کاراکتر با مالکیت توسعه‌ای در حالت DB ذخیره می‌شوند. امنیت حساب تولیدی عمدا برای مراحل بعدی مانده است.',
    'shell.builderMvp.title': 'نسخه اولیه سازنده',
    'shell.characterTools': 'ابزارهای کاراکتر',
    'shell.demoProfile': 'پروفایل دمو',
  },
} satisfies Record<Locale, Record<string, string>>;

type Messages = typeof messages.en;
type MessageKey = keyof Messages;

type I18nContextValue = {
  dir: 'ltr' | 'rtl';
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const storedLocale = window.localStorage.getItem(localeStorageKey);

  return locales.includes(storedLocale as Locale)
    ? (storedLocale as Locale)
    : defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const dir = locale === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [dir, locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      dir,
      locale,
      setLocale: setLocaleState,
      t: (key, values = {}) => {
        let message = messages[locale][key] ?? messages.en[key] ?? key;

        for (const [name, replacement] of Object.entries(values)) {
          message = message.replaceAll(`{${name}}`, replacement);
        }

        return message;
      },
    }),
    [dir, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }

  return context;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      aria-label={t('common.language')}
      className="inline-flex w-fit rounded-xl border border-slate-700 bg-slate-950/45 p-1 text-xs font-black text-slate-300 shadow-lg shadow-black/10"
      role="group"
    >
      {locales.map((candidate) => (
        <button
          aria-pressed={locale === candidate}
          className={[
            'rounded-lg px-3 py-1.5 transition',
            locale === candidate
              ? 'bg-amber-400 text-slate-950'
              : 'hover:bg-slate-800 hover:text-slate-50',
          ].join(' ')}
          key={candidate}
          onClick={() => setLocale(candidate)}
          type="button"
        >
          {candidate === 'fa'
            ? t('common.switchToPersian')
            : t('common.switchToEnglish')}
        </button>
      ))}
    </div>
  );
}
