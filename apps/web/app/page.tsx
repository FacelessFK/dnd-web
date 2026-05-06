import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-6 py-16">
      <span className="inline-flex w-fit rounded border border-amber-700 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">
        Phase 9 handoff + runtime cockpit
      </span>
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          D&amp;D DM-Driven Platform
        </h1>
        <p className="text-lg leading-8 text-slate-700">
          The backend runtime is now operable from the browser. Use the
          developer cockpit to create sessions, seed sample characters and
          scenes, drive encounters, inspect read models, and watch live SSE
          events.
        </p>
      </div>
      <div className="rounded border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Runtime tools
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/runtime"
          >
            Open Runtime Cockpit
          </Link>
          <a
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:border-slate-500"
            href="http://localhost:2567/"
          >
            Check Server Status
          </a>
        </div>
      </div>
    </main>
  );
}
