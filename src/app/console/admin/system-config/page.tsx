'use client'

/**
 * Merged "System Configuration" admin page -- combines three formerly
 * separate nav entries (Page Columns & Cards, Custom Fields, Option
 * Lists) into one page with tabs, per explicit direction to reduce Admin
 * nav clutter without losing any capability (unlike page-columns/custom-
 * fields/option-lists' quick prior removal-from-nav pass, this time the
 * pages are actually consolidated, not just hidden). The three tab panels
 * are the exact same components/logic that used to live at
 * /console/admin/page-columns, /custom-fields, /option-lists -- those
 * routes now just redirect here (see their own page.tsx, now a redirect
 * stub) so any old bookmark/link still lands somewhere useful.
 */

import { useState } from 'react'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import PageColumnsPanel from './PageColumnsPanel'
import CustomFieldsPanel from './CustomFieldsPanel'
import OptionListsPanel from './OptionListsPanel'

type TabKey = 'columns' | 'custom-fields' | 'options'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'columns', label: 'Columns & Cards' },
  { key: 'custom-fields', label: 'Custom Fields' },
  { key: 'options', label: 'Option Lists' },
]

function SystemConfigInner() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'columns'
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? initialTab : 'columns')

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="System Configuration"
        description="Table columns & dashboard cards, custom form fields, and dropdown option lists — all in one place."
      />

      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-3 hover:text-ink-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'columns' && <PageColumnsPanel />}
      {tab === 'custom-fields' && <CustomFieldsPanel />}
      {tab === 'options' && <OptionListsPanel />}
    </div>
  )
}

export default function SystemConfigPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <SystemConfigInner />
    </Suspense>
  )
}
