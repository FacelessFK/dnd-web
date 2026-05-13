'use client';

import Link from 'next/link';
import { LanguageSwitcher, useI18n } from '../lib/i18n';

export default function HomePage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-5 py-12 sm:px-8">
        <div className="flex max-w-3xl flex-col items-start gap-4">
          <LanguageSwitcher />
          <span className="inline-flex w-fit rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-200">
            {t('home.eyebrow')}
          </span>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            {t('home.title')}
          </h1>
          <p className="text-lg leading-8 text-slate-300">{t('home.intro')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            className="rounded-2xl border border-amber-300/35 bg-amber-400 px-5 py-4 font-bold text-slate-950 shadow-lg shadow-black/25 transition hover:bg-amber-300"
            href="/runtime"
          >
            <span className="block text-lg">
              {t('home.card.runtime.title')}
            </span>
            <span className="mt-1 block text-sm font-medium text-slate-900/75">
              {t('home.card.runtime.description')}
            </span>
          </Link>
          <Link
            className="rounded-2xl border border-slate-600/70 bg-slate-900/70 px-5 py-4 font-bold text-slate-50 shadow-lg shadow-black/20 transition hover:border-slate-400"
            href="/characters"
          >
            <span className="block text-lg">
              {t('home.card.characters.title')}
            </span>
            <span className="mt-1 block text-sm font-medium text-slate-300">
              {t('home.card.characters.description')}
            </span>
          </Link>
          <a
            className="rounded-2xl border border-slate-700 bg-slate-950/50 px-5 py-4 font-bold text-slate-100 shadow-lg shadow-black/20 transition hover:border-amber-300/50"
            href="http://localhost:2567/"
          >
            <span className="block text-lg">{t('home.card.server.title')}</span>
            <span className="mt-1 block text-sm font-medium text-slate-400">
              {t('home.card.server.description')}
            </span>
          </a>
        </div>
      </div>
    </main>
  );
}
