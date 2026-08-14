'use client'
import { useState } from 'react'
import { Search, Wrench, CheckCircle2, Phone, MapPin, Smartphone, Hash, User, XCircle, PackageSearch } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * PUBLIC page -- a customer looks up their repair status by workorder
 * number only, no login required (phone-number lookup removed per explicit
 * direction -- workorder number is the precise, unambiguous identifier
 * printed on the customer's own intake receipt). No full page reload on
 * search -- this is already a client-side fetch against
 * /api/public/workorder-status, so only the result panel re-renders.
 */

interface WorkorderStatus {
  jobSheetNumber: string
  status: string
  product: string
  imei: string
  issueDescription: string
  engineerName: string
  loggedAt: string
  scheduledAt: string | null
  completedAt: string | null
  serviceCenter: { name: string; phone: string; logo: string; location: string } | null
}

const STEPS = [
  { key: 'CREATED', label: 'Received' },
  { key: 'REPAIR_STARTED', label: 'Diagnosis' },
  { key: 'REPAIR_IN_PROGRESS', label: 'Repair in Progress' },
  { key: 'REPAIR_COMPLETED', label: 'Repair Completed' },
  { key: 'CLOSED', label: 'Ready / Delivered' },
]

// PART_PENDING branches off the main line rather than sitting on it -- it's
// a wait state, not a step everyone passes through.
function stepIndexFor(status: string): number {
  if (status === 'PART_PENDING') return 2
  const i = STEPS.findIndex((s) => s.key === status)
  return i === -1 ? 0 : i
}

export default function TrackWorkorderPage() {
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
      const res = await fetch(`/api/public/workorder-status?jobSheetNumber=${encodeURIComponent(value.trim())}`)
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

  const isCancelled = result?.status === 'CANCELLED'
  const isPartPending = result?.status === 'PART_PENDING'
  const activeStep = result ? stepIndexFor(result.status) : 0

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-[120px]" />
        <div className="absolute right-1/4 bottom-0 h-80 w-80 rounded-full bg-info-soft blur-[100px]" />
      </div>

      <div className="relative max-w-xl mx-auto px-4 pt-16 pb-16 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-3 py-1 mb-4">
            <Wrench className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Repair Tracking</span>
          </div>
          <h1 className="h-page">Track Your Repair</h1>
          <p className="text-ink-2 mt-2">Enter your workorder number to see live status, device details, and the service center handling it.</p>
        </div>

        <Card className="shadow-card-lg">
          <CardBody className="space-y-4">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. JOB-2526-0001"
                  className="tabular"
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={loading} className="sm:w-auto">
                <Search className="h-4 w-4 mr-1.5" />
                {loading ? 'Searching…' : 'Track'}
              </Button>
            </form>
            <p className="text-xs text-ink-3">Your workorder number is printed on the intake receipt you received when you dropped off your device.</p>

            {error && (
              <EmptyState kind="search" title="Not found" description={error} />
            )}
          </CardBody>
        </Card>

        {result && (
          <div className="space-y-4">
            {/* Status timeline */}
            <Card className="shadow-card-lg overflow-hidden">
              <CardBody>
                <div className="flex items-center justify-between mb-1">
                  <span className="eyebrow">Workorder</span>
                  <span className="tabular font-semibold text-accent">{result.jobSheetNumber}</span>
                </div>

                {isCancelled ? (
                  <div className="flex items-center gap-2 mt-4 text-ink-2">
                    <XCircle className="h-5 w-5 text-danger" />
                    <span className="font-medium">This workorder was cancelled.</span>
                  </div>
                ) : (
                  <div className="mt-6">
                    <div className="relative flex items-center justify-between">
                      <div className="absolute left-0 right-0 top-3 h-0.5 bg-border" />
                      <div
                        className="absolute left-0 top-3 h-0.5 bg-accent transition-all duration-500"
                        style={{ width: `${(activeStep / (STEPS.length - 1)) * 100}%` }}
                      />
                      {STEPS.map((s, i) => {
                        const done = i < activeStep
                        const current = i === activeStep
                        return (
                          <div key={s.key} className="relative flex flex-col items-center flex-1 z-10">
                            <div
                              className={`h-6 w-6 rounded-full flex items-center justify-center border-2 ${
                                done || current
                                  ? 'bg-accent border-accent text-accent-fg'
                                  : 'bg-surface border-border text-ink-3'
                              }`}
                            >
                              {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                            </div>
                            <span className={`mt-2 text-[10px] text-center leading-tight ${current ? 'text-accent font-semibold' : 'text-ink-3'}`}>
                              {s.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {isPartPending && (
                      <div className="mt-5 flex items-center gap-2 rounded-control border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
                        <PackageSearch className="h-4 w-4 flex-shrink-0" />
                        Waiting on a spare part to arrive — we'll resume repair as soon as it's in.
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Device / repair details */}
            <Card className="shadow-card-lg">
              <CardBody className="space-y-3">
                <span className="eyebrow">Repair Details</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  {result.product && (
                    <div className="flex items-start gap-2.5">
                      <Smartphone className="h-4 w-4 text-ink-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-ink-3">Device</div>
                        <div className="text-sm font-medium">{result.product}</div>
                      </div>
                    </div>
                  )}
                  {result.imei && (
                    <div className="flex items-start gap-2.5">
                      <Hash className="h-4 w-4 text-ink-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-ink-3">IMEI / Serial</div>
                        <div className="text-sm font-medium tabular">{result.imei}</div>
                      </div>
                    </div>
                  )}
                  {result.engineerName && (
                    <div className="flex items-start gap-2.5">
                      <User className="h-4 w-4 text-ink-3 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-ink-3">Engineer</div>
                        <div className="text-sm font-medium">{result.engineerName}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5">
                    <Wrench className="h-4 w-4 text-ink-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-ink-3">{result.completedAt ? 'Completed' : 'Logged'}</div>
                      <div className="text-sm font-medium">
                        {new Date(result.completedAt || result.loggedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </div>
                {result.issueDescription && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-ink-3 mb-1">Reported Issue</div>
                    <p className="text-sm text-ink-2">{result.issueDescription}</p>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Service center */}
            {result.serviceCenter && (
              <Card className="shadow-card-lg">
                <CardBody className="flex items-center gap-4">
                  {result.serviceCenter.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.serviceCenter.logo} alt="" className="h-12 w-12 rounded-control object-contain border border-border bg-surface-2 flex-shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-control bg-accent-soft flex items-center justify-center flex-shrink-0">
                      <Wrench className="h-5 w-5 text-accent" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-ink-3">Handled by</div>
                    <div className="font-semibold truncate">{result.serviceCenter.name}</div>
                    {result.serviceCenter.location && (
                      <div className="flex items-center gap-1 text-xs text-ink-3 mt-0.5">
                        <MapPin className="h-3 w-3" /> {result.serviceCenter.location}
                      </div>
                    )}
                  </div>
                  {result.serviceCenter.phone && (
                    <a
                      href={`tel:${result.serviceCenter.phone}`}
                      className="flex items-center gap-1.5 rounded-control bg-accent text-accent-fg text-sm font-medium px-3 py-2 hover:bg-accent-hover transition-colors flex-shrink-0"
                    >
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
