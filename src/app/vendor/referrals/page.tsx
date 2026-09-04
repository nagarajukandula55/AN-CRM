'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Share2, Copy, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

/**
 * Invite other service centers with your own referral link -- whoever
 * signs up through it gets 10 bonus trial days (25 total instead of 15).
 * See api/vendors/apply/route.ts's referredByCode handling.
 */
export default function VendorReferralsPage() {
  const { data, isLoading } = useSWR('/api/vendor/referrals')
  const [copied, setCopied] = useState(false)

  if (isLoading) return <div className="p-6"><LoadingPanel label="Loading…" /></div>
  if (!data?.success) return <div className="p-6"><Card><CardBody>Couldn&apos;t load your referral info.</CardBody></Card></div>

  const code: string | null = data.referralCode
  const referred: { companyName: string; createdAt: string; status: string }[] = data.referred || []
  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/partner-signup?ref=${code}` : ''

  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Refer a Service Center"
        description="Share your link — they get 10 bonus trial days. When they subscribe, you get rewarded too: 15 free days added to your plan for a 2-year subscription, or 10% off your next renewal for a 1-year subscription."
      />

      <Card>
        <CardBody>
          <p className="text-sm font-semibold text-ink mb-1">Your referral link</p>
          {code ? (
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="flex-1 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-ink-2" onFocus={(e) => e.target.select()} />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Your referral code isn&apos;t ready yet — check back shortly.</p>
          )}
          <p className="text-xs text-ink-3 mt-2 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" /> Share it with other repair/service shops you know.
          </p>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardBody>
          <p className="h-section mb-3">People you&apos;ve referred ({referred.length})</p>
          {referred.length === 0 ? (
            <EmptyState kind="empty" title="No referrals yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-ink-3 text-xs eyebrow">
                  <tr>
                    <th className="text-left py-2">Company</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {referred.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2">{r.companyName}</td>
                      <td className="py-2"><Badge tone="success">{r.status}</Badge></td>
                      <td className="py-2 text-ink-3">{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
