export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <span className="inline-flex w-fit rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-sm text-slate-600">
        Phase 0 Foundation
      </span>
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          D&amp;D DM-Driven Platform
        </h1>
        <p className="text-lg leading-8 text-slate-700">
          This workspace is intentionally minimal. The web app exists as a clean
          Next.js App Router baseline so the real-time session runtime can be
          built in later phases.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
          Included now
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
          <li>pnpm monorepo workspace</li>
          <li>Next.js frontend scaffold</li>
          <li>Node.js server scaffold</li>
          <li>shared package placeholders</li>
        </ul>
      </div>
    </main>
  );
}
