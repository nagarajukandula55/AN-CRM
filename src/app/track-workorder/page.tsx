'use client'
import { useState } from 'react'
import { Search, Wrench, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * PUBLIC page -- a customer looks up their repair status by workorder
 * number or mobile number, no login required. Only the single most recent
 * workorder is shown for a phone lookup (see api/public/workorder-status's
 * own comment), per explicit direction.
 */

interface WorkorderStatus {
  jobSheetNumber: string
  status: string
  product: string
  engineerName: string
  loggedAt: string
  scheduledAt: string | null
  completedAt: string | null
}

const STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  CREATED: { label: 'Received', tone: 'neutral' },
  REPAIR_STARTED: { label: 'Repair Started', tone: 'info' },
  REPAIR_IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  PART_PENDING: { label: 'Waiting on Part', tone: 'warning' },
  REPAIR_COMPLETED: { label: 'Repair Completed', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

export default function TrackWorkorderPage() {
  const [mode, setMode] = useState<'jobSheetNumber' | 'phone'>('jobSheetNumber')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<WorkorderStatus | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/public/workorder-status?${mode}=${encodeURIComponent(value.trim())}`)
      const data = await res.json()
      if (data.success) {
        setResult(data.workorder)
      } else {
        setError(data.message || 'No workorder found for that reference')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const statusInfo = result ? STATUS_LABELS[result.status] || { label: result.status, tone: 'neutral' as const } : null

  return (
    <div className="min-h-screen bg-bg text-ink flex items-start justify-center p-4 pt-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="h-page">Track Your Repair</h1>
          <p className="text-ink-2 mt-1">Check your workorder status by number or mobile</p>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('jobSheetNumber')}
                className={`flex-1 rounded-control px-3 py-2 text-sm border ${mode === 'jobSheetNumber' ? 'border-accent bg-accent-soft text-accent' : 'border-border text-ink-2'}`}
              >
                Workorder Number
              </button>
              <button
                type="button"
                onClick={() => setMode('phone')}
                className={`flex-1 rounded-control px-3 py-2 text-sm border ${mode === 'phone' ? 'border-accent bg-accent-soft text-accent' : 'border-border text-ink-2'}`}
              >
                Mobile Number
              </button>
            </div>

            <form onSubmit={handleSearch} className="space-y-3">
              <Field label={mode === 'jobSheetNumber' ? 'Workorder Number' : 'Mobile Number'}>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === 'jobSheetNumber' ? 'e.g. JOB-2526-0001' : 'e.g. 98765 43210'}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                <Search className="h-4 w-4 mr-1.5" />
                {loading ? 'Searching…' : 'Check Status'}
              </Button>
            </form>

            {error && (
              <EmptyState kind="search" title="Not found" description={error} />
            )}

            {result && statusInfo && (
              <div className="border border-border rounded-card p-4 space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Workorder</span>
                  <span className="tabular font-medium">{result.jobSheetNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-2 text-sm">Status</span>
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                </div>
                {result.product && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-2 text-sm">Product</span>
                    <span className="text-sm">{result.product}</span>
                  </div>
                )}
                {result.engineerName && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-2 text-sm">Engineer</span>
                    <span className="text-sm">{result.engineerName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-ink-3 text-xs pt-2 border-t border-border">
                  {result.completedAt ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed {new Date(result.completedAt).toLocaleDateString()}
                    </>
                  ) : (
                    <>
                      <Wrench className="h-3.5 w-3.5" />
                      Logged {new Date(result.loggedAt).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
