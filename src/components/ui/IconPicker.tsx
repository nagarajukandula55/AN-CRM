'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { ICON_NAMES, SUGGESTED_ICON_NAMES, getIcon } from '@/core/icons/registry'
import { cn } from './cn'

interface IconPickerProps {
  value?: string
  onChange: (name: string) => void
  /** Renders as a small icon+name button by default; pass false to render
   * just the trigger content yourself (e.g. wrapping an existing button). */
  className?: string
}

const MAX_RESULTS = 240 // 1594 icons is too many DOM nodes to render at once unfiltered

/** Searchable grid picker over the full lucide-react icon set (see
 * core/icons/registry.ts) -- portaled like CatalogRequestModal so it's
 * safe to drop inside any form without the nested-<form> bug. Assign an
 * icon to a module, a nav item, a custom button -- anywhere a component
 * accepts an icon *name* string (this returns the name, not JSX, so it
 * serializes cleanly to the DB same as Business.modules[].icon already does). */
export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query.trim()) return SUGGESTED_ICON_NAMES
    const q = query.trim().toLowerCase()
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
  }, [query])

  const Current = getIcon(value)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-control border border-border-strong bg-surface text-sm text-ink hover:bg-surface-2 transition-colors',
          className
        )}
      >
        {Current ? <Current className="w-4 h-4 text-accent" /> : <span className="w-4 h-4 rounded border border-dashed border-ink-3" />}
        <span className="text-ink-2">{value || 'Choose icon…'}</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-card border border-border bg-surface shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Search className="w-4 h-4 text-ink-3 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search 1,594 icons…"
                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3"
              />
              <button type="button" onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-2 text-ink-3">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 grid grid-cols-6 sm:grid-cols-8 gap-2">
              {results.map((name) => {
                const Icon = getIcon(name)!
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => { onChange(name); setOpen(false); setQuery('') }}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-control border transition-colors',
                      value === name ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2'
                    )}
                  >
                    <Icon className="w-5 h-5 text-ink-2" />
                    <span className="text-[9px] text-ink-3 truncate w-full text-center">{name}</span>
                  </button>
                )
              })}
              {results.length === 0 && (
                <p className="col-span-full text-center text-sm text-ink-3 py-8">No icons match "{query}".</p>
              )}
            </div>
            {!query && (
              <div className="px-4 py-2 border-t border-border text-xs text-ink-3">
                Showing suggested icons — type to search all 1,594.
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
