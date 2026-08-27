/**
 * Shown INSTANTLY by Next.js while vendor/layout.tsx (an async Server
 * Component doing several sequential DB lookups -- vendor identity, trial
 * status, nav module filtering) resolves on a hard navigation/refresh.
 * Without this file, the browser shows a totally blank white screen for
 * however long those queries take -- reported live ("should not take
 * that much time on blank headers screen"). A lightweight skeleton that
 * roughly matches the real shell's shape reads as "loading", not "broken".
 */
export default function VendorLoading() {
  return (
    <div className="flex h-screen bg-bg overflow-hidden animate-pulse">
      <aside className="chrome-dark w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col h-full">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-control bg-surface-2" />
            <div className="min-w-0 space-y-1.5">
              <div className="h-3 w-24 rounded bg-surface-2" />
              <div className="h-2.5 w-16 rounded bg-surface-2" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded-control bg-surface-2" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6 space-y-4">
        <div className="h-6 w-48 rounded bg-surface-2" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-card bg-surface-2" />
          ))}
        </div>
      </main>
    </div>
  );
}
