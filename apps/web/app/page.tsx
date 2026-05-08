import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-6 py-16 text-amber-50">
      <span className="inline-flex w-fit rounded-full border border-amber-300/30 bg-amber-950/40 px-3 py-1 text-sm font-semibold text-amber-100">
        Phase 9 handoff + runtime war table
      </span>
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight">
          D&amp;D DM-Driven Platform
        </h1>
        <p className="text-lg leading-8 text-amber-100/75">
          The backend runtime is now operable from the browser. Use the
          role-aware runtime surface to create sessions, seed sample characters
          and scenes, drive encounters, inspect read models, and watch live SSE
          events on a tactical tabletop. A separate frontend-only Character
          Library and step-by-step Character Builder scaffold is also available
          for product exploration.
        </p>
      </div>
      <div className="rounded-3xl border border-amber-500/20 bg-[#1c130d]/85 p-6 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300/75">
          Runtime tools
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded-xl border border-amber-300/55 bg-amber-400 px-4 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
            href="/runtime"
          >
            Open Runtime War Table
          </Link>
          <Link
            className="rounded-xl border border-purple-300/45 bg-purple-950/70 px-4 py-2 text-sm font-bold text-purple-50 transition hover:border-purple-200"
            href="/characters"
          >
            Open Character Library
          </Link>
          <a
            className="rounded-xl border border-amber-300/25 bg-black/20 px-4 py-2 text-sm font-bold text-amber-50 transition hover:border-amber-200/55"
            href="http://localhost:2567/"
          >
            Check Server Status
          </a>
        </div>
      </div>
    </main>
  );
}
