'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { LoadingPanel } from '@/components/ui/Spinner'

interface ColumnRow {
  key: string
  defaultLabel: string
  label: string
  visible: boolean
  order: number
  group?: string
}

// The sidebar's real group/subgroup identifiers (src/components/
// sidebar-nav.ts's NAV_GROUPS) -- a sidebar item can be reassigned to any
// of THESE existing groups, not an arbitrary new one, same "no add, only
// rename/hide/reorder/regroup existing" boundary as every other config
// screen here. Flat top-level groups have no `key` in sidebar-nav.ts
// itself (only a `label`), so they're addressed here as "grp:<label>";
// the Admin group's 4 subgroups DO have real keys, used as-is.
const SIDEBAR_GROUPS = [
  { key: 'grp:Overview', label: 'Overview' },
  { key: 'grp:SC', label: 'SC' },
  { key: 'grp:Sales', label: 'Sales' },
  { key: 'grp:Materials & Inventory', label: 'Materials & Inventory' },
  { key: 'grp:Finance', label: 'Finance' },
  { key: 'grp:Business', label: 'Business' },
  { key: 'grp:Documents', label: 'Documents' },
  { key: 'grp:Reports', label: 'Reports' },
  { key: 'grp:Support', label: 'Support' },
  { key: 'adm-users', label: 'Admin > Users & Access' },
  { key: 'adm-vendors', label: 'Admin > Vendors' },
  { key: 'adm-system', label: 'Admin > System' },
  { key: 'adm-docs', label: 'Admin > Documents & Billing' },
]

// Every real sidebar-nav.ts item, seeded with its current label + which
// group it structurally lives in today -- shown in the picker even before
// a config has ever been saved. Kept in sync manually with
// sidebar-nav.ts's NAV_GROUPS; sidebar.tsx applies a saved override only
// when its `group` value matches a real key above.
const SIDEBAR_NAV_ROWS: ColumnRow[] = [
  { key: 'dashboard', defaultLabel: 'Dashboard', label: 'Dashboard', visible: true, order: 0, group: 'grp:Overview' },
  { key: 'sc_dashboard', defaultLabel: 'CRM Overview', label: 'CRM Overview', visible: true, order: 1, group: 'grp:SC' },
  { key: 'sc_jobsheets', defaultLabel: 'Workorders', label: 'Workorders', visible: true, order: 2, group: 'grp:SC' },
  { key: 'sc-masters-brands', defaultLabel: 'Brands & Models', label: 'Brands & Models', visible: true, order: 3, group: 'grp:SC' },
  { key: 'sc-masters-solutions', defaultLabel: 'Solutions', label: 'Solutions', visible: true, order: 4, group: 'grp:SC' },
  { key: 'sub-accounts', defaultLabel: 'SC Sub-Accounts', label: 'SC Sub-Accounts', visible: true, order: 5, group: 'grp:SC' },
  { key: 'orders', defaultLabel: 'Orders', label: 'Orders', visible: true, order: 6, group: 'grp:Sales' },
  { key: 'sales', defaultLabel: 'Sales', label: 'Sales', visible: true, order: 7, group: 'grp:Sales' },
  { key: 'inventory', defaultLabel: 'Inventory', label: 'Inventory', visible: true, order: 8, group: 'grp:Materials & Inventory' },
  { key: 'warehouses', defaultLabel: 'Warehouses', label: 'Warehouses', visible: true, order: 9, group: 'grp:Materials & Inventory' },
  { key: 'material-catalog', defaultLabel: 'Material Catalog', label: 'Material Catalog', visible: true, order: 10, group: 'grp:Materials & Inventory' },
  { key: 'masters-catalog-requests', defaultLabel: 'Catalog Change Requests', label: 'Catalog Change Requests', visible: true, order: 11, group: 'grp:Materials & Inventory' },
  { key: 'stock-transfers', defaultLabel: 'Stock Transfers', label: 'Stock Transfers', visible: true, order: 12, group: 'grp:Materials & Inventory' },
  { key: 'stock-adjustments', defaultLabel: 'Stock Adjustments', label: 'Stock Adjustments', visible: true, order: 13, group: 'grp:Materials & Inventory' },
  { key: 'finance', defaultLabel: 'Finance', label: 'Finance', visible: true, order: 14, group: 'grp:Finance' },
  { key: 'customers', defaultLabel: 'Customer Data', label: 'Customer Data', visible: true, order: 15, group: 'grp:Business' },
  { key: 'sub-vendors', defaultLabel: 'Sub-Vendors', label: 'Sub-Vendors', visible: true, order: 16, group: 'grp:Business' },
  { key: 'agreements', defaultLabel: 'Agreements', label: 'Agreements', visible: true, order: 17, group: 'grp:Documents' },
  { key: 'quotations', defaultLabel: 'Quotations', label: 'Quotations', visible: true, order: 18, group: 'grp:Documents' },
  { key: 'delivery-challans', defaultLabel: 'Delivery Challans', label: 'Delivery Challans', visible: true, order: 19, group: 'grp:Documents' },
  { key: 'credit-notes', defaultLabel: 'Credit Notes', label: 'Credit Notes', visible: true, order: 20, group: 'grp:Documents' },
  { key: 'debit-notes', defaultLabel: 'Debit Notes', label: 'Debit Notes', visible: true, order: 21, group: 'grp:Documents' },
  { key: 'proforma-invoices', defaultLabel: 'Proforma Invoices', label: 'Proforma Invoices', visible: true, order: 22, group: 'grp:Documents' },
  { key: 'reports', defaultLabel: 'Reports & Downloads', label: 'Reports & Downloads', visible: true, order: 23, group: 'grp:Reports' },
  { key: 'report-builder', defaultLabel: 'Report Builder', label: 'Report Builder', visible: true, order: 24, group: 'grp:Reports' },
  { key: 'analytics', defaultLabel: 'Analytics', label: 'Analytics', visible: true, order: 25, group: 'grp:Reports' },
  { key: 'support_tickets', defaultLabel: 'Support Tickets', label: 'Support Tickets', visible: true, order: 26, group: 'grp:Support' },
  { key: 'contact-messages', defaultLabel: 'Contact Messages', label: 'Contact Messages', visible: true, order: 27, group: 'grp:Support' },
  { key: 'admin-users', defaultLabel: 'User Management', label: 'User Management', visible: true, order: 28, group: 'adm-users' },
  { key: 'admin-access', defaultLabel: 'Access Control', label: 'Access Control', visible: true, order: 29, group: 'adm-users' },
  { key: 'admin-roles', defaultLabel: 'Roles & Permissions', label: 'Roles & Permissions', visible: true, order: 30, group: 'adm-users' },
  { key: 'admin-an-group-staff', defaultLabel: 'Platform Staff', label: 'Platform Staff', visible: true, order: 31, group: 'adm-users' },
  { key: 'vendors', defaultLabel: 'Vendors', label: 'Vendors', visible: true, order: 32, group: 'adm-vendors' },
  { key: 'vendor-subscriptions', defaultLabel: 'Vendor Subscriptions', label: 'Vendor Subscriptions', visible: true, order: 33, group: 'adm-vendors' },
  { key: 'admin-vendor-billing', defaultLabel: 'Vendor Billing', label: 'Vendor Billing', visible: true, order: 34, group: 'adm-vendors' },
  { key: 'admin-vendor-settlements', defaultLabel: 'Vendor Settlements', label: 'Vendor Settlements', visible: true, order: 35, group: 'adm-vendors' },
  { key: 'admin-plan-features', defaultLabel: 'Plan Features', label: 'Plan Features', visible: true, order: 36, group: 'adm-system' },
  { key: 'admin-page-columns', defaultLabel: 'Page Columns & Cards', label: 'Page Columns & Cards', visible: true, order: 37, group: 'adm-system' },
  { key: 'admin-option-lists', defaultLabel: 'Option Lists', label: 'Option Lists', visible: true, order: 38, group: 'adm-system' },
  { key: 'admin-settings', defaultLabel: 'Settings', label: 'Settings', visible: true, order: 39, group: 'adm-system' },
  { key: 'admin-plan', defaultLabel: 'Plan & Billing', label: 'Plan & Billing', visible: true, order: 40, group: 'adm-system' },
  { key: 'admin-help', defaultLabel: 'Help & System Guide', label: 'Help & System Guide', visible: true, order: 41, group: 'adm-system' },
  { key: 'admin-document-templates', defaultLabel: 'Document Templates', label: 'Document Templates', visible: true, order: 42, group: 'adm-docs' },
  { key: 'admin-invoice-templates', defaultLabel: 'Invoice Branding', label: 'Invoice Branding', visible: true, order: 43, group: 'adm-docs' },
  { key: 'admin-gst', defaultLabel: 'GST', label: 'GST', visible: true, order: 44, group: 'adm-docs' },
  { key: 'admin-product-feedback', defaultLabel: 'Product Feedback', label: 'Product Feedback', visible: true, order: 45, group: 'adm-docs' },
  { key: 'admin-telegram-users', defaultLabel: 'Telegram Users', label: 'Telegram Users', visible: true, order: 46, group: 'adm-docs' },
]

// Every page wired to useColumnConfig() so far, plus their real hardcoded
// current columns -- shown in the picker even before a config has ever been
// saved for them (the admin GET-all route only returns pages that already
// have a saved override).
const KNOWN_PAGES: Record<string, ColumnRow[]> = {
  jobsheets: [
    { key: 'jobSheetNumber', defaultLabel: 'Job Sheet #', label: 'Job Sheet #', visible: true, order: 0 },
    { key: 'customerName', defaultLabel: 'Customer', label: 'Customer', visible: true, order: 1 },
    { key: 'phone', defaultLabel: 'Phone', label: 'Phone', visible: true, order: 2 },
    { key: 'title', defaultLabel: 'Title', label: 'Title', visible: true, order: 3 },
    { key: 'status', defaultLabel: 'Status', label: 'Status', visible: true, order: 4 },
    { key: 'tat', defaultLabel: 'TAT', label: 'TAT', visible: true, order: 5 },
    { key: 'createdAt', defaultLabel: 'Created', label: 'Created', visible: true, order: 6 },
    { key: 'actions', defaultLabel: 'Actions', label: 'Actions', visible: true, order: 7 },
  ],
  customers: [
    { key: 'name', defaultLabel: 'Name', label: 'Name', visible: true, order: 0 },
    { key: 'contact', defaultLabel: 'Contact', label: 'Contact', visible: true, order: 1 },
    { key: 'gstin', defaultLabel: 'GSTIN', label: 'GSTIN', visible: true, order: 2 },
    { key: 'location', defaultLabel: 'Location', label: 'Location', visible: true, order: 3 },
    { key: 'imeiOrSerial', defaultLabel: 'IMEI/Serial', label: 'IMEI/Serial', visible: true, order: 4 },
    { key: 'source', defaultLabel: 'Source', label: 'Source', visible: true, order: 5 },
    { key: 'date', defaultLabel: 'Date', label: 'Date', visible: true, order: 6 },
  ],
  inventory: [
    { key: 'name', defaultLabel: 'Name', label: 'Name', visible: true, order: 0 },
    { key: 'sku', defaultLabel: 'SKU', label: 'SKU', visible: true, order: 1 },
    { key: 'category', defaultLabel: 'Category', label: 'Category', visible: true, order: 2 },
    { key: 'quantity', defaultLabel: 'Qty', label: 'Qty', visible: true, order: 3 },
    { key: 'unit', defaultLabel: 'Unit', label: 'Unit', visible: true, order: 4 },
    { key: 'reorderLevel', defaultLabel: 'Reorder', label: 'Reorder', visible: true, order: 5 },
    { key: 'status', defaultLabel: 'Status', label: 'Status', visible: true, order: 6 },
  ],
  // SC dashboard's two stat-card rows (console/sc/dashboard) -- same
  // rename/hide/reorder config, just cards instead of table columns.
  // "Add" isn't offered for cards any more than it is for columns: each
  // key maps to a real computed value in the dashboard, there's no
  // arbitrary-card mechanism -- rename/hide/reorder existing cards only.
  'sc-dashboard-cards-period': [
    { key: 'workordersToday', defaultLabel: 'Workorders Today', label: 'Workorders Today', visible: true, order: 0 },
    { key: 'workordersWeek', defaultLabel: 'Workorders This Week', label: 'Workorders This Week', visible: true, order: 1 },
    { key: 'workordersMonth', defaultLabel: 'Workorders This Month', label: 'Workorders This Month', visible: true, order: 2 },
    { key: 'workordersYear', defaultLabel: 'Workorders This Year', label: 'Workorders This Year', visible: true, order: 3 },
  ],
  'sc-dashboard-cards-summary': [
    { key: 'openWorkorders', defaultLabel: 'Open Workorders', label: 'Open Workorders', visible: true, order: 0 },
    { key: 'overdueWorkorders', defaultLabel: 'Overdue (7d+)', label: 'Overdue (7d+)', visible: true, order: 1 },
    { key: 'repairCompleted', defaultLabel: 'Repair Completed', label: 'Repair Completed', visible: true, order: 2 },
    { key: 'partPending', defaultLabel: 'Part Pending', label: 'Part Pending', visible: true, order: 3 },
    { key: 'closedThisMonth', defaultLabel: 'Closed This Month', label: 'Closed This Month', visible: true, order: 4 },
    { key: 'cancelledWorkorders', defaultLabel: 'Cancelled', label: 'Cancelled', visible: true, order: 5 },
  ],
  // Sidebar menu items -- rename + reassign to a different EXISTING group
  // (see sidebar.tsx's application of this same "sidebar-nav" pageKey).
  'sidebar-nav': SIDEBAR_NAV_ROWS,
}

export default function PageColumnsAdminPage() {
  const [pageKeys, setPageKeys] = useState<string[]>(Object.keys(KNOWN_PAGES))
  const [selectedKey, setSelectedKey] = useState<string>('jobsheets')
  const [rows, setRows] = useState<ColumnRow[]>(KNOWN_PAGES.jobsheets)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Populate the picker with every registered pageKey (from saved configs)
  // plus the hardcoded known pages, so pages show up even before ever being
  // saved once.
  useEffect(() => {
    fetch('/api/admin/page-column-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const fromServer: string[] = Array.isArray(d?.configs) ? d.configs.map((c: any) => c.pageKey) : []
        setPageKeys(Array.from(new Set([...Object.keys(KNOWN_PAGES), ...fromServer])).sort())
      })
      .catch(() => {})
  }, [])

  // Load the selected page's saved config (if any), merged over its known
  // defaults so newly-added default columns still show up.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const defaults = KNOWN_PAGES[selectedKey] ?? []
    fetch(`/api/admin/page-column-config/${selectedKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const saved: ColumnRow[] | undefined = d?.config?.columns
        if (Array.isArray(saved) && saved.length > 0) {
          const savedMap = new Map(saved.map((c) => [c.key, c]))
          const merged = defaults.map((def, i) => {
            const ov = savedMap.get(def.key)
            return ov
              ? { key: def.key, defaultLabel: def.defaultLabel, label: ov.label ?? def.defaultLabel, visible: ov.visible !== false, order: ov.order ?? i, group: ov.group ?? def.group }
              : { ...def, order: i }
          })
          setRows(merged.sort((a, b) => a.order - b.order))
        } else {
          setRows(defaults)
        }
      })
      .catch(() => setRows(defaults))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedKey])

  function updateRow(idx: number, patch: Partial<ColumnRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function moveRow(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((r, i) => ({ ...r, order: i }))
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const columns = rows.map((r, i) => ({ ...r, order: i }))
      const res = await fetch(`/api/admin/page-column-config/${selectedKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save')
      showToast('Column config saved')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-card border border-border bg-surface px-5 py-3 text-sm text-ink shadow-card-lg">
          {toast}
        </div>
      )}

      <PageHeader
        title="Page Columns & Cards"
        description="Control which columns and dashboard cards vendor pages show, their order, and their label text."
        actions={<Button onClick={handleSave} disabled={saving || loading} loading={saving} icon={<Save className="w-4 h-4" />}>Save</Button>}
      />

      <Card className="mb-6">
        <CardBody>
          <Field label="Page" className="max-w-xs">
            <Select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              {pageKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {error && <div className="mb-6 text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</div>}

      {loading ? (
        <LoadingPanel label="Loading columns…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3 text-xs eyebrow">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Key</th>
                  <th className="text-left px-4 py-3">Label</th>
                  {selectedKey === 'sidebar-nav' && <th className="text-left px-4 py-3">Group</th>}
                  <th className="text-left px-4 py-3">Visible</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === 0}
                          onClick={() => moveRow(idx, -1)}
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 rounded-control hover:bg-surface-3 text-ink-2 disabled:opacity-30"
                          disabled={idx === rows.length - 1}
                          onClick={() => moveRow(idx, 1)}
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ink-2">{row.key}</td>
                    <td className="px-4 py-3">
                      <Input
                        value={row.label}
                        onChange={(e) => updateRow(idx, { label: e.target.value })}
                        className="max-w-xs"
                      />
                    </td>
                    {selectedKey === 'sidebar-nav' && (
                      <td className="px-4 py-3">
                        <Select
                          value={row.group ?? ''}
                          onChange={(e) => updateRow(idx, { group: e.target.value })}
                          className="max-w-xs"
                        >
                          {SIDEBAR_GROUPS.map((g) => (
                            <option key={g.key} value={g.key}>{g.label}</option>
                          ))}
                        </Select>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.visible}
                        onChange={(e) => updateRow(idx, { visible: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
