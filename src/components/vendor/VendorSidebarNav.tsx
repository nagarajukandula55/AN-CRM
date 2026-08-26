'use client'

/**
 * Renders the vendor sidebar nav with collapsible section groups
 * (Workorders/Billing/Stock/Reports/Account) -- each section header is a
 * toggle button that expands/collapses its items, persisted per-browser in
 * localStorage so it stays collapsed/expanded across page navigations
 * (each nav click is a full route change, so state can't just live in
 * memory). Un-sectioned items (Dashboard) always render, un-collapsible.
 */

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

type NavItem = {
  href: string
  label: string
  // A pre-rendered icon ELEMENT, not the icon component itself -- a
  // Server Component (vendor/layout.tsx) can't pass a component/function
  // reference as a prop to a Client Component (this file) across the RSC
  // boundary (React can't serialize a function), which crashed this page
  // for every vendor with "Functions cannot be passed directly to Client
  // Components". A rendered ReactNode (JSX), by contrast, IS serializable
  // across that boundary, so the icon is instantiated server-side and
  // handed down already-rendered.
  icon: ReactNode
  section?: string
}

const STORAGE_KEY = 'an_vendor_nav_collapsed_sections'

export default function VendorSidebarNav({ items }: { items: NavItem[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCollapsed(JSON.parse(raw))
    } catch {
      // ignore -- default all expanded
    }
  }, [])

  function toggleSection(section: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <>
      {items.map((item, i) => {
        const newSection = item.section && item.section !== items[i - 1]?.section
        const isCollapsed = item.section ? !!collapsed[item.section] : false
        return (
          <div key={item.href}>
            {newSection && (
              <button
                type="button"
                onClick={() => toggleSection(item.section!)}
                className="flex w-full items-center justify-between px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3 first:pt-1.5 hover:text-ink transition-colors"
              >
                {item.section}
                <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
            )}
            {!isCollapsed && (
              <Link
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink transition-all duration-150 text-sm group"
              >
                {item.icon}
                {item.label}
              </Link>
            )}
          </div>
        )
      })}
    </>
  )
}
