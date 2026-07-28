'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useAuth } from '../../lib/auth-context';
import { selectAuthErrorCopy } from '../../lib/auth-error-copy';
import { useI18n } from '../../lib/i18n';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { error, errorCode, errorRetryAfterSeconds, loading, login, register } =
    useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Throttle rejections get localized copy; everything else keeps showing the
  // server's own message, which is what this page did before.
  const errorCopy = selectAuthErrorCopy({
    code: errorCode ?? undefined,
    retryAfterSeconds: errorRetryAfterSeconds ?? undefined,
  });
  const errorText = errorCopy ? t(errorCopy.key, errorCopy.values) : error;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok =
      mode === 'login'
        ? await login({ email, password })
        : await register({ displayName, email, password });

    if (ok) {
      router.push('/characters');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <section>
          <Link className="text-sm font-bold text-amber-200" href="/">
            DND Web
          </Link>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
            ورود به کتابخانه کاراکترهای شخصی
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-slate-300">
            از اینجا به بعد هر کاراکتری که می‌سازی به حساب خودت وصل می‌شود و بعد
            از خروج و برگشت هم در PostgreSQL باقی می‌ماند.
          </p>
        </section>

        <form
          className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/30"
          onSubmit={submit}
        >
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/70 p-1">
            <button
              className={`rounded-lg px-4 py-2 text-sm font-black ${
                mode === 'login'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300'
              }`}
              onClick={() => setMode('login')}
              type="button"
            >
              ورود
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-black ${
                mode === 'register'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300'
              }`}
              onClick={() => setMode('register')}
              type="button"
            >
              ثبت‌نام
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {mode === 'register' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-300">
                  نام نمایشی
                </span>
                <input
                  className="w-full rounded-xl border border-slate-600 bg-slate-950/45 px-4 py-3 outline-none focus:border-amber-300"
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">
                ایمیل
              </span>
              <input
                className="w-full rounded-xl border border-slate-600 bg-slate-950/45 px-4 py-3 text-left outline-none focus:border-amber-300"
                dir="ltr"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">
                رمز عبور
              </span>
              <input
                className="w-full rounded-xl border border-slate-600 bg-slate-950/45 px-4 py-3 text-left outline-none focus:border-amber-300"
                dir="ltr"
                minLength={mode === 'register' ? 8 : undefined}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
          </div>

          {errorText ? (
            <p
              className="mt-4 rounded-xl border border-red-300/30 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              role="alert"
            >
              {errorText}
            </p>
          ) : null}

          <button
            className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading
              ? 'در حال بررسی...'
              : mode === 'login'
                ? 'ورود'
                : 'ساخت حساب'}
          </button>
        </form>
      </div>
    </main>
  );
}
