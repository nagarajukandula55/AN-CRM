/**
 * Shown INSTANTLY by Next.js while console/layout.tsx's server-side gate
 * check (and AdminShell's own mount) resolves on a hard navigation/
 * refresh -- same reasoning as vendor/loading.tsx: without this, the
 * browser shows a blank white screen for however long that takes.
 */
export default function ConsoleLoading() {
  return (
    <div className="flex h-screen bg-bg overflow-hidden animate-pulse">
      <aside className="chrome-dark w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col h-full">
        <div className="p-5 border-b border-border">
          <div className="h-6 w-32 rounded bg-surface-2" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 rounded-control bg-surface-2" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6 space-y-4">
        <div className="h-6 w-48 rounded bg-surface-2" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-card bg-surface-2" />
          ))}
        </div>
      </main>
    </div>
  );
}
