'use client'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Plus, X, Play, Trash2, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Table2 } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Custom report builder -- pick a data source, pick fields, filter, chart
 * type, save, run, and optionally schedule an email. Per explicit
 * direction ("Go with the fuller builder -- saved reports, scheduling,
 * charts"). Backed by /api/reports/definitions (+ /run), data sources and
 * their allowlisted fields defined in core/reports/dataSources.ts.
 */

const DATA_SOURCE_OPTIONS = [
  { value: 'CRM_CALLS', label: 'Calls' },
  { value: 'CRM_JOBSHEETS', label: 'Workorders' },
  { value: 'SALES_INVOICES', label: 'Invoices' },
  { value: 'VENDORS', label: 'Vendors' },
  { value: 'CUSTOMERS', label: 'Customers' },
]

// Kept in exact sync with core/reports/dataSources.ts's DATA_SOURCES allowlist
// -- that file is the real server-side source of truth (runReport.ts trusts
// nothing else), this is just its field/label pairs for the picker UI.
const FIELDS_BY_SOURCE: Record<string, { key: string; label: string }[]> = {
  CRM_CALLS: [
    { key: 'callNumber', label: 'Call Number' }, { key: 'customerName', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' }, { key: 'subject', label: 'Subject' },
    { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' },
    { key: 'source', label: 'Source' }, { key: 'estimatedValue', label: 'Estimated Value' },
    { key: 'nextFollowUpAt', label: 'Next Follow-Up' }, { key: 'createdAt', label: 'Created At' },
  ],
  CRM_JOBSHEETS: [
    { key: 'jobSheetNumber', label: 'Workorder Number' }, { key: 'customerName', label: 'Customer Name' },
    { key: 'phone', label: 'Phone' }, { key: 'company', label: 'Company' },
    { key: 'title', label: 'Title' }, { key: 'product', label: 'Product' },
    { key: 'deviceModel', label: 'Device Model' }, { key: 'imeiOrSerialNumber', label: 'IMEI / Serial Number' },
    { key: 'status', label: 'Status' }, { key: 'warrantyStatus', label: 'Warranty Status' },
    { key: 'assignedToName', label: 'Engineer' }, { key: 'ccoName', label: 'CCO' },
    { key: 'serviceCharge', label: 'Service Charge' }, { key: 'createdAt', label: 'Created At' },
    { key: 'engineerAssignedAt', label: 'Engineer Assigned At' }, { key: 'repairInProgressAt', label: 'Repair In Progress At' },
    { key: 'partPendingAt', label: 'Part Pending At' }, { key: 'repairResumedAt', label: 'Repair Resumed At' },
    { key: 'completedAt', label: 'Completed At' }, { key: 'handedOverAt', label: 'Handed Over At' },
  ],
  SALES_INVOICES: [
    { key: 'invoiceNumber', label: 'Invoice Number' }, { key: 'invoiceType', label: 'Type' },
    { key: 'status', label: 'Status' }, { key: 'subtotal', label: 'Subtotal' },
    { key: 'grandTotal', label: 'Grand Total' }, { key: 'taxTotal', label: 'Tax Total' },
    { key: 'discountAmount', label: 'Discount' }, { key: 'salesExecutiveName', label: 'Sales Executive' },
    { key: 'createdAt', label: 'Created At' }, { key: 'dueDate', label: 'Due Date' },
    { key: 'paidAt', label: 'Payment Date' },
  ],
  VENDORS: [
    { key: 'vendorId', label: 'Vendor ID' }, { key: 'companyName', label: 'Company Name' },
    { key: 'contactPerson', label: 'Contact Person' }, { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }, { key: 'appliedAs', label: 'Applied As' },
    { key: 'isApproved', label: 'Approved' }, { key: 'createdAt', label: 'Created At' },
  ],
  CUSTOMERS: [
    { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' }, { key: 'city', label: 'City' },
    { key: 'state', label: 'State' }, { key: 'imeiOrSerialNumbers', label: 'IMEI / Serial Numbers' },
    { key: 'source', label: 'Source' }, { key: 'sourceModule', label: 'Source Module' },
    { key: 'createdAt', label: 'Created At' },
  ],
}

const CHART_COLORS = ['#5B3DF5', '#8B5CF6', '#C084FC', '#F0ABFC', '#22D3EE', '#34D399']

interface SavedReport {
  _id: string
  name: string
  dataSource: string
  fields: string[]
  groupByField?: string
  chartType: 'TABLE' | 'BAR' | 'LINE' | 'PIE'
  schedule: { frequency: string; recipientEmails: string[] }
}

export default function ReportBuilderPage() {
  const { data, mutate } = useSWR('/api/reports/definitions', (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  )
  const reports: SavedReport[] = data?.success ? data.reports : []

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [dataSource, setDataSource] = useState('CRM_CALLS')
  const [fields, setFields] = useState<string[]>([])
  const [groupByField, setGroupByField] = useState('')
  const [chartType, setChartType] = useState<'TABLE' | 'BAR' | 'LINE' | 'PIE'>('TABLE')
  const [scheduleFreq, setScheduleFreq] = useState('NONE')
  const [recipientEmails, setRecipientEmails] = useState('')
  const [sendToTelegram, setSendToTelegram] = useState(false)
  const [saving, setSaving] = useState(false)

  const [activeReportId, setActiveReportId] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ rows: any[]; chartData?: { label: string; value: number }[] } | null>(null)
  const [running, setRunning] = useState(false)

  const availableFields = FIELDS_BY_SOURCE[dataSource] || []

  function toggleField(key: string) {
    setFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || fields.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/reports/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          dataSource,
          fields,
          filters: [],
          groupByField: groupByField || undefined,
          chartType,
          schedule: {
            frequency: scheduleFreq,
            recipientEmails: recipientEmails.split(',').map((e) => e.trim()).filter(Boolean),
            sendToTelegram,
          },
        }),
      })
      const result = await res.json()
      if (result.success) {
        setShowForm(false)
        setName('')
        setFields([])
        setGroupByField('')
        setChartType('TABLE')
        setScheduleFreq('NONE')
        setRecipientEmails('')
        setSendToTelegram(false)
        mutate()
      }
    } finally {
      setSaving(false)
    }
  }

  async function runReport(report: SavedReport) {
    setActiveReportId(report._id)
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch(`/api/reports/definitions/${report._id}/run`, { credentials: 'include' })
      const result = await res.json()
      if (result.success) setRunResult({ rows: result.rows, chartData: result.chartData })
    } finally {
      setRunning(false)
    }
  }

  async function deleteReport(id: string) {
    await fetch(`/api/reports/definitions/${id}`, { method: 'DELETE', credentials: 'include' })
    if (activeReportId === id) {
      setActiveReportId(null)
      setRunResult(null)
    }
    mutate()
  }

  const activeReport = reports.find((r) => r._id === activeReportId)

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Report Builder"
        description="Build, save, chart and schedule custom reports across calls, workorders, invoices, vendors and customers."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {showForm ? 'Cancel' : 'New Report'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Report Name *">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Revenue by Status" />
              </Field>
              <Field label="Data Source">
                <Select value={dataSource} onChange={(e) => { setDataSource(e.target.value); setFields([]); setGroupByField('') }}>
                  {DATA_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </div>

            <div>
              <div className="text-xs text-ink-3 mb-2">Fields to include *</div>
              <div className="flex flex-wrap gap-2">
                {availableFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleField(f.key)}
                    className={`px-3 py-1.5 rounded-control border text-xs font-medium transition-colors ${
                      fields.includes(f.key) ? 'bg-accent text-accent-fg border-accent' : 'border-border text-ink-2 hover:bg-surface-2'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Chart Type">
                <Select value={chartType} onChange={(e) => setChartType(e.target.value as any)}>
                  <option value="TABLE">Table</option>
                  <option value="BAR">Bar Chart</option>
                  <option value="LINE">Line Chart</option>
                  <option value="PIE">Pie Chart</option>
                </Select>
              </Field>
              {chartType !== 'TABLE' && (
                <Field label="Group By (for chart)">
                  <Select value={groupByField} onChange={(e) => setGroupByField(e.target.value)}>
                    <option value="">Select…</option>
                    {availableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Schedule">
                <Select value={scheduleFreq} onChange={(e) => setScheduleFreq(e.target.value)}>
                  <option value="NONE">No schedule</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </Field>
            </div>

            {scheduleFreq !== 'NONE' && (
              <>
                <Field label="Email recipients (comma-separated)">
                  <Input value={recipientEmails} onChange={(e) => setRecipientEmails(e.target.value)} placeholder="you@business.com, team@business.com" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sendToTelegram} onChange={(e) => setSendToTelegram(e.target.checked)} />
                  Also send a summary to this business's Telegram (Settings &gt; Operations &gt; Telegram Chat/Group ID)
                </label>
              </>
            )}

            <Button type="submit" disabled={saving || !name.trim() || fields.length === 0}>
              {saving ? 'Saving…' : 'Save Report'}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-3">
          {reports.length === 0 ? (
            <EmptyState kind="empty" title="No saved reports yet" />
          ) : (
            reports.map((r) => (
              <Card key={r._id} className={activeReportId === r._id ? 'border-accent' : ''}>
                <CardBody className="flex items-center justify-between gap-2">
                  <button onClick={() => runReport(r)} className="text-left flex-1">
                    <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                      {r.chartType === 'BAR' && <BarChart3 className="h-3.5 w-3.5 text-accent" />}
                      {r.chartType === 'LINE' && <LineChartIcon className="h-3.5 w-3.5 text-accent" />}
                      {r.chartType === 'PIE' && <PieChartIcon className="h-3.5 w-3.5 text-accent" />}
                      {r.chartType === 'TABLE' && <Table2 className="h-3.5 w-3.5 text-accent" />}
                      {r.name}
                    </div>
                    <div className="text-xs text-ink-3 mt-0.5">
                      {DATA_SOURCE_OPTIONS.find((o) => o.value === r.dataSource)?.label}
                      {r.schedule.frequency !== 'NONE' && ` · ${r.schedule.frequency.toLowerCase()}`}
                    </div>
                  </button>
                  <button onClick={() => runReport(r)} className="text-accent hover:opacity-70"><Play className="h-4 w-4" /></button>
                  <button onClick={() => deleteReport(r._id)} className="text-danger hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {running ? (
            <LoadingPanel label="Running report…" />
          ) : runResult && activeReport ? (
            <Card>
              <CardBody>
                {activeReport.chartType === 'BAR' && runResult.chartData && (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={runResult.chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#5B3DF5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {activeReport.chartType === 'LINE' && runResult.chartData && (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={runResult.chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#5B3DF5" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {activeReport.chartType === 'PIE' && runResult.chartData && (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={runResult.chartData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} label>
                        {runResult.chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {runResult.rows[0] && Object.keys(runResult.rows[0]).filter((k) => k !== '_id').map((k) => (
                          <th key={k} className="text-left px-3 py-2 text-ink-3 font-medium">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runResult.rows.slice(0, 50).map((row, i) => (
                        <tr key={i}>
                          {Object.keys(row).filter((k) => k !== '_id').map((k) => (
                            <td key={k} className="px-3 py-2 text-ink-2">{String(row[k] ?? '—')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {runResult.rows.length === 0 && <EmptyState kind="empty" title="No data" />}
                </div>
              </CardBody>
            </Card>
          ) : (
            <EmptyState kind="empty" title="Select a report to run it" description="Pick a saved report from the list, or create a new one." />
          )}
        </div>
      </div>
    </div>
  )
}
