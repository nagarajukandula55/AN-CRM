'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Public (no-login) NPS survey page -- reached via the SMS/WhatsApp link
 * sent to a customer ~1 hour after their device is handed over. Standalone
 * page (no admin sidebar shell), same pattern as /print pages, since a
 * customer visiting this link is never logged into AN-CRM at all.
 */
export default function ServiceFeedbackPage() {
  const params = useParams()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [jobSheet, setJobSheet] = useState<{ jobSheetNumber: string; customerName: string; device: string } | null>(null)

  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/feedback/service/${token}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok || d.success === false) {
          if (d.alreadySubmitted) setAlreadySubmitted(true)
          throw new Error(d.message || 'This feedback link is invalid or has expired.')
        }
        setJobSheet(d.jobSheet)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function submit() {
    if (score === null) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/feedback/service/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npsScore: score, comment }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.message || 'Failed to submit feedback')
      setSubmitted(true)
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingPanel label="Loading…" />

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-6 text-center">
        {error || alreadySubmitted ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
            <h1 className="h-section mb-2">{alreadySubmitted ? 'Already submitted' : 'Link unavailable'}</h1>
            <p className="text-sm text-ink-2">{error}</p>
          </>
        ) : submitted ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <h1 className="h-section mb-2">Thank you!</h1>
            <p className="text-sm text-ink-2">Your feedback helps us improve our service.</p>
          </>
        ) : (
          <>
            <h1 className="h-section mb-1">How was your service?</h1>
            <p className="text-sm text-ink-2 mb-1">{jobSheet?.customerName}, thanks for choosing us.</p>
            {jobSheet?.device && <p className="text-xs text-ink-3 mb-5">{jobSheet.jobSheetNumber} — {jobSheet.device}</p>}

            <p className="text-xs text-ink-3 mb-2">How likely are you to recommend us to a friend? (0 = not likely, 10 = extremely likely)</p>
            <div className="grid grid-cols-11 gap-1 mb-5">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  onClick={() => setScore(n)}
                  className={`aspect-square rounded-control text-xs font-medium border transition-colors ${
                    score === n ? 'bg-accent text-white border-accent' : 'bg-surface-2 border-border text-ink-2 hover:border-accent'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Anything you'd like to tell us? (optional)"
              className="w-full bg-surface border border-border rounded-control px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 mb-4 resize-none"
            />

            {submitError && <p className="text-xs text-danger mb-3">{submitError}</p>}

            <Button className="w-full" onClick={submit} disabled={score === null || submitting}>
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
