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
    'runtime.assignmentRequests.ac': 'AC',
    'runtime.assignmentRequests.build': 'Build',
    'runtime.assignmentRequests.character': 'Character',
    'runtime.assignmentRequests.hp': 'HP',
    'runtime.assignmentRequests.previewUnavailableDetail':
      'Recover table state or read the pending character to show the full request preview.',
    'runtime.assignmentRequests.previewUnavailableTitle':
      'Character preview unavailable',
    'runtime.assignmentRequests.runtimeCopy': 'Runtime copy',
    'runtime.assignmentRequests.sourceLibraryEntry': 'Source library entry',
    'runtime.assignmentRequests.speed': 'Speed',
    'runtime.board.badge.move': 'Movement target',
    'runtime.board.badge.selected': 'Selected token',
    'runtime.board.badge.target': 'Attack target',
    'runtime.board.badge.turn': 'Current turn',
    'runtime.board.camera': 'Camera',
    'runtime.board.gridLabel':
      'Tactical grid. Use arrow keys to move the selected cell, Home for the first cell, and End for the last cell.',
    'runtime.board.panDown': 'Pan down',
    'runtime.board.panLeft': 'Pan left',
    'runtime.board.panRight': 'Pan right',
    'runtime.board.panUp': 'Pan up',
    'runtime.board.resetView': 'Reset view',
    'runtime.board.viewportSummary': '{zoom} zoom · pan {panX}, {panY}',
    'runtime.board.zoomIn': 'Zoom in',
    'runtime.board.zoomOut': 'Zoom out',
    'runtime.characterLibrary.blocker.alreadyAssigned':
      'This participant already has an assigned character.',
    'runtime.characterLibrary.blocker.alreadySubmitted':
      'A character is already waiting for DM assignment.',
    'runtime.characterLibrary.blocker.busy':
      'Wait for the current runtime task to finish.',
    'runtime.characterLibrary.blocker.missingAuth':
      'Sign in before loading saved Character Library entries.',
    'runtime.characterLibrary.blocker.missingSelection':
      'Choose a finalized saved character first.',
    'runtime.characterLibrary.blocker.missingSession':
      'Create, paste, or recover a session first.',
    'runtime.characterLibrary.blocker.noFinalizedEntries':
      'No finalized saved characters are available.',
    'runtime.characterLibrary.blocker.notJoined':
      'Join or recover this session as the player first.',
    'runtime.characterLibrary.description':
      'Submit a finalized saved character into this live session. The server creates a separate runtime copy; live HP, movement, conditions, and DM overrides do not mutate the saved entry.',
    'runtime.characterLibrary.emptyDetail':
      'Finalize a character in the Character Library, then refresh this list.',
    'runtime.characterLibrary.emptyTitle': 'No finalized saved characters',
    'runtime.characterLibrary.entryClass': 'Class / level',
    'runtime.characterLibrary.entryId': 'Library entry',
    'runtime.characterLibrary.entryStatus': 'Library status',
    'runtime.characterLibrary.errorTitle': 'Character Library unavailable',
    'runtime.characterLibrary.loading': 'Loading library',
    'runtime.characterLibrary.optionLabel':
      '{name} - {className} level {level}',
    'runtime.characterLibrary.refresh': 'Refresh Library',
    'runtime.characterLibrary.selectLabel': 'Saved character',
    'runtime.characterLibrary.selectRequired':
      'Choose a finalized saved character first.',
    'runtime.characterLibrary.signInRequired':
      'Sign in before loading saved Character Library entries.',
    'runtime.characterLibrary.submit': 'Submit Saved Character',
    'runtime.characterLibrary.title': 'Saved Character Library',
    'runtime.eyebrow': 'Authoritative table surface',
    'runtime.actionFeedback.ac': 'AC {armorClass}',
    'runtime.actionFeedback.acUnknown': 'AC unknown',
    'runtime.actionFeedback.attackBlocked': 'Blocked',
    'runtime.actionFeedback.attackReady': 'Ready',
    'runtime.actionFeedback.damage': '{damage} damage',
    'runtime.actionFeedback.hit': 'Hit',
    'runtime.actionFeedback.hp': 'HP {current}/{max} +{temp}',
    'runtime.actionFeedback.hpUnknown': 'HP unknown',
    'runtime.actionFeedback.miss': 'Miss',
    'runtime.actionFeedback.noResult': 'No attack result yet.',
    'runtime.actionFeedback.noTarget': 'No target',
    'runtime.actionFeedback.noTargetDetail':
      'Choose a target to preview attack readiness.',
    'runtime.actionFeedback.resultSummary':
      '{attacker} attacked {target}; HP {previous} -> {current}.',
    'runtime.actionFeedback.resultTitle': 'Latest result',
    'runtime.actionFeedback.roll': 'Roll {roll}',
    'runtime.actionFeedback.status': 'Status {status}',
    'runtime.actionFeedback.targetKind.character': 'Character',
    'runtime.actionFeedback.targetKind.combatant': 'Monster/NPC',
    'runtime.actionFeedback.targetTitle': 'Selected target',
    'runtime.mode.dm': 'DM Mode',
    'runtime.mode.player': 'Player Mode',
    'runtime.movementFeedback.after':
      'After move {after} ft used, {remaining} ft left',
    'runtime.movementFeedback.afterUnknown': 'After move unknown',
    'runtime.movementFeedback.blocked': 'Move blocked',
    'runtime.movementFeedback.budget':
      '{remaining} ft left of {speed} ft ({used} used)',
    'runtime.movementFeedback.current': 'From {cell}',
    'runtime.movementFeedback.destination': 'To {cell}',
    'runtime.movementFeedback.distance': '{distance} ft',
    'runtime.movementFeedback.distanceUnknown': 'Distance unknown',
    'runtime.movementFeedback.explorationBudget': 'Exploration move',
    'runtime.movementFeedback.noPosition': 'not placed',
    'runtime.movementFeedback.ready': 'Move ready',
    'runtime.movementFeedback.title': 'Movement preview',
    'runtime.nav.characters': 'Characters',
    'runtime.outbox.refresh': 'Check Outbox',
    'runtime.outbox.status.backlog': 'Outbox {count}',
    'runtime.outbox.status.clear': 'Outbox clear',
    'runtime.outbox.status.error': 'Outbox unavailable',
    'runtime.outbox.status.loading': 'Outbox ...',
    'runtime.outbox.status.off': 'Outbox off',
    'runtime.outbox.status.unknown': 'Outbox -',
    'runtime.status.busy': 'Busy: {label}',
    'runtime.status.stream': 'Stream {status}',
    'runtime.status.streamIdle': 'Stream idle',
    'runtime.summary':
      'A role-aware browser surface for the existing backend. The server still owns truth; SSE is live-only, and recovery rebuilds state from read models.',
    'runtime.title': 'Runtime War Table',
    'runtime.turnRail.action': 'Action {state}',
    'runtime.turnRail.actorKind.character': 'Character',
    'runtime.turnRail.actorKind.combatant': 'Monster/NPC',
    'runtime.turnRail.available': 'available',
    'runtime.turnRail.bonus': 'Bonus {state}',
    'runtime.turnRail.movement': 'Movement',
    'runtime.turnRail.movementRemaining':
      '{remaining} ft left of {speed} ft ({used} used)',
    'runtime.turnRail.movementUnknown': '{used} ft used',
    'runtime.turnRail.reaction': 'Reaction {state}',
    'runtime.turnRail.roundInitiative':
      'Round {round} · initiative {initiative}',
    'runtime.turnRail.title': 'Current turn',
    'runtime.turnRail.used': 'used',
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
    'runtime.assignmentRequests.ac': 'AC',
    'runtime.assignmentRequests.build': 'ساختار',
    'runtime.assignmentRequests.character': 'کاراکتر',
    'runtime.assignmentRequests.hp': 'HP',
    'runtime.assignmentRequests.previewUnavailableDetail':
      'برای نمایش preview کامل درخواست، وضعیت میز را recover کنید یا کاراکتر pending را دوباره بخوانید.',
    'runtime.assignmentRequests.previewUnavailableTitle':
      'Preview کاراکتر در دسترس نیست',
    'runtime.assignmentRequests.runtimeCopy': 'نسخه runtime',
    'runtime.assignmentRequests.sourceLibraryEntry': 'ورودی کتابخانه منبع',
    'runtime.assignmentRequests.speed': 'سرعت',
    'runtime.board.badge.move': 'مقصد حرکت',
    'runtime.board.badge.selected': 'توکن انتخاب‌شده',
    'runtime.board.badge.target': 'هدف حمله',
    'runtime.board.badge.turn': 'نوبت فعلی',
    'runtime.board.camera': 'دوربین',
    'runtime.board.gridLabel':
      'گرید تاکتیکی. با کلیدهای جهت‌دار سلول انتخاب‌شده را حرکت دهید، Home برای اولین سلول و End برای آخرین سلول.',
    'runtime.board.panDown': 'حرکت دوربین به پایین',
    'runtime.board.panLeft': 'حرکت دوربین به چپ',
    'runtime.board.panRight': 'حرکت دوربین به راست',
    'runtime.board.panUp': 'حرکت دوربین به بالا',
    'runtime.board.resetView': 'بازنشانی نما',
    'runtime.board.viewportSummary': 'زوم {zoom} · جابه‌جایی {panX}, {panY}',
    'runtime.board.zoomIn': 'زوم بیشتر',
    'runtime.board.zoomOut': 'زوم کمتر',
    'runtime.characterLibrary.blocker.alreadyAssigned':
      'این شرکت‌کننده از قبل کاراکتر assign شده دارد.',
    'runtime.characterLibrary.blocker.alreadySubmitted':
      'یک کاراکتر همین حالا منتظر assign شدن توسط DM است.',
    'runtime.characterLibrary.blocker.busy':
      'صبر کنید کار فعلی میز زنده تمام شود.',
    'runtime.characterLibrary.blocker.missingAuth':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.blocker.missingSelection':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.blocker.missingSession':
      'اول یک session بسازید، وارد کنید، یا بازیابی کنید.',
    'runtime.characterLibrary.blocker.noFinalizedEntries':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای در دسترس نیست.',
    'runtime.characterLibrary.blocker.notJoined':
      'اول به عنوان این بازیکن وارد session شوید یا آن را بازیابی کنید.',
    'runtime.characterLibrary.description':
      'یک کاراکتر ذخیره‌شده و نهایی‌شده را وارد این session زنده کنید. سرور یک نسخه runtime جدا می‌سازد؛ HP، حرکت، conditionها و overrideهای DM ورودی ذخیره‌شده را تغییر نمی‌دهند.',
    'runtime.characterLibrary.emptyDetail':
      'یک کاراکتر را در کتابخانه نهایی کنید و بعد این فهرست را refresh کنید.',
    'runtime.characterLibrary.emptyTitle':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای نیست',
    'runtime.characterLibrary.entryClass': 'کلاس / سطح',
    'runtime.characterLibrary.entryId': 'ورودی کتابخانه',
    'runtime.characterLibrary.entryStatus': 'وضعیت کتابخانه',
    'runtime.characterLibrary.errorTitle': 'کتابخانه کاراکتر در دسترس نیست',
    'runtime.characterLibrary.loading': 'در حال بارگذاری کتابخانه',
    'runtime.characterLibrary.optionLabel': '{name} - {className} سطح {level}',
    'runtime.characterLibrary.refresh': 'Refresh کتابخانه',
    'runtime.characterLibrary.selectLabel': 'کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.selectRequired':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.signInRequired':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.submit': 'Submit کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.title': 'کتابخانه کاراکترهای ذخیره‌شده',
    'runtime.eyebrow': 'سطح کنترل مرجع برای میز بازی',
    'runtime.actionFeedback.ac': 'AC {armorClass}',
    'runtime.actionFeedback.acUnknown': 'AC نامشخص',
    'runtime.actionFeedback.attackBlocked': 'مسدود',
    'runtime.actionFeedback.attackReady': 'آماده',
    'runtime.actionFeedback.damage': '{damage} آسیب',
    'runtime.actionFeedback.hit': 'برخورد',
    'runtime.actionFeedback.hp': 'HP {current}/{max} +{temp}',
    'runtime.actionFeedback.hpUnknown': 'HP نامشخص',
    'runtime.actionFeedback.miss': 'خطا',
    'runtime.actionFeedback.noResult': 'هنوز نتیجه حمله‌ای ثبت نشده.',
    'runtime.actionFeedback.noTarget': 'بدون هدف',
    'runtime.actionFeedback.noTargetDetail':
      'یک هدف انتخاب کنید تا آمادگی حمله دیده شود.',
    'runtime.actionFeedback.resultSummary':
      '{attacker} به {target} حمله کرد؛ HP {previous} -> {current}.',
    'runtime.actionFeedback.resultTitle': 'آخرین نتیجه',
    'runtime.actionFeedback.roll': 'Roll {roll}',
    'runtime.actionFeedback.status': 'وضعیت {status}',
    'runtime.actionFeedback.targetKind.character': 'کاراکتر',
    'runtime.actionFeedback.targetKind.combatant': 'هیولا/NPC',
    'runtime.actionFeedback.targetTitle': 'هدف انتخاب‌شده',
    'runtime.mode.dm': 'حالت DM',
    'runtime.mode.player': 'حالت بازیکن',
    'runtime.movementFeedback.after':
      'بعد از حرکت {after} فوت مصرف‌شده، {remaining} فوت مانده',
    'runtime.movementFeedback.afterUnknown': 'بعد از حرکت نامشخص',
    'runtime.movementFeedback.blocked': 'حرکت مسدود',
    'runtime.movementFeedback.budget':
      '{remaining} فوت مانده از {speed} فوت ({used} مصرف شده)',
    'runtime.movementFeedback.current': 'از {cell}',
    'runtime.movementFeedback.destination': 'به {cell}',
    'runtime.movementFeedback.distance': '{distance} فوت',
    'runtime.movementFeedback.distanceUnknown': 'فاصله نامشخص',
    'runtime.movementFeedback.explorationBudget': 'حرکت اکتشافی',
    'runtime.movementFeedback.noPosition': 'قرار نگرفته',
    'runtime.movementFeedback.ready': 'حرکت آماده',
    'runtime.movementFeedback.title': 'پیش‌نمایش حرکت',
    'runtime.nav.characters': 'کاراکترها',
    'runtime.outbox.refresh': 'بررسی Outbox',
    'runtime.outbox.status.backlog': 'Outbox {count}',
    'runtime.outbox.status.clear': 'Outbox پاک',
    'runtime.outbox.status.error': 'Outbox در دسترس نیست',
    'runtime.outbox.status.loading': 'Outbox ...',
    'runtime.outbox.status.off': 'Outbox خاموش',
    'runtime.outbox.status.unknown': 'Outbox -',
    'runtime.status.busy': 'درگیر: {label}',
    'runtime.status.stream': 'استریم {status}',
    'runtime.status.streamIdle': 'استریم غیرفعال',
    'runtime.summary':
      'یک سطح مرورگری متناسب با نقش کاربر برای بک‌اند فعلی. وضعیت نهایی همچنان دست سرور است؛ SSE فقط رویدادهای زنده را می‌رساند و بازیابی، وضعیت را از مدل‌های خواندنی بازسازی می‌کند.',
    'runtime.title': 'میز نبرد زنده',
    'runtime.turnRail.action': 'اکشن {state}',
    'runtime.turnRail.actorKind.character': 'کاراکتر',
    'runtime.turnRail.actorKind.combatant': 'هیولا/NPC',
    'runtime.turnRail.available': 'آماده',
    'runtime.turnRail.bonus': 'بونس {state}',
    'runtime.turnRail.movement': 'حرکت',
    'runtime.turnRail.movementRemaining':
      '{remaining} فوت مانده از {speed} فوت ({used} مصرف شده)',
    'runtime.turnRail.movementUnknown': '{used} فوت مصرف شده',
    'runtime.turnRail.reaction': 'ری‌اکشن {state}',
    'runtime.turnRail.roundInitiative':
      'راند {round} · initiative {initiative}',
    'runtime.turnRail.title': 'نوبت فعلی',
    'runtime.turnRail.used': 'مصرف‌شده',
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
