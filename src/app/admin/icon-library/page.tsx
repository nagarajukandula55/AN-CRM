'use client'

import { useMemo, useState } from 'react'
import { Search, Copy } from 'lucide-react'
import { ICON_NAMES, SUGGESTED_ICON_NAMES, getIcon } from '@/core/icons/registry'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/shared/Toast'

/**
 * Browse the full lucide-react icon set (1,594 icons) available anywhere
 * in the app via the shared <IconPicker /> component
 * (src/components/ui/IconPicker.tsx) -- that component is what a form
 * plugs in to let a user assign an icon to a module/nav item/button (it
 * returns a name string, same shape Business.modules[].icon already
 * stores). This page is the reference/browse surface: search, preview at
 * a glance, and copy the exact name to paste wherever a component takes
 * an icon name prop.
 */
export default function IconLibraryPage() {
  const [query, setQuery] = useState('')
  const toast = useToast()

  const results = useMemo(() => {
    if (!query.trim()) return SUGGESTED_ICON_NAMES
    const q = query.trim().toLowerCase()
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(q))
  }, [query])

  function copyName(name: string) {
    navigator.clipboard.writeText(name).then(() => toast.success(`Copied "${name}"`)).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <PageHeader
          eyebrow="Design System"
          title="Icon Library"
          description={`${ICON_NAMES.length.toLocaleString()} icons from lucide-react — the same set every "Choose icon…" picker in the app (module icons, nav items, custom buttons) draws from. Click any icon to copy its name.`}
        />

        <div className="flex items-center gap-3 mb-6 rounded-control border border-border-strong bg-surface px-4 py-2.5">
          <Search className="w-4 h-4 text-ink-3 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons…`}
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3"
          />
        </div>

        {!query && <p className="eyebrow mb-3">Suggested for this app</p>}

        {results.length === 0 ? (
          <EmptyState kind="search" title="No icons found" description={`Nothing matches "${query}".`} />
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {results.map((name) => {
              const Icon = getIcon(name)!
              return (
                <button
                  key={name}
                  onClick={() => copyName(name)}
                  title={`Copy "${name}"`}
                  className="group flex flex-col items-center gap-1.5 p-3 rounded-control border border-border bg-surface hover:border-accent hover:bg-accent-soft transition-colors"
                >
                  <Icon className="w-5 h-5 text-ink-2 group-hover:text-accent transition-colors" />
                  <span className="text-[9px] text-ink-3 truncate w-full text-center">{name}</span>
                  <Copy className="w-3 h-3 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
