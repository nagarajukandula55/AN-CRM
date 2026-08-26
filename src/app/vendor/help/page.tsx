'use client'

/**
 * Vendor Help Center -- video tutorial library. Feature pages link here
 * with ?video=<key> for a contextual "Watch tutorial" shortcut (see
 * components/shared/TutorialLink.tsx) -- that key auto-opens the matching
 * video's player on load. Catalog is admin-managed at
 * console/admin/tutorial-videos; only isPublished videos show here.
 */

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { PlayCircle, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'
import { VendorTelegramChat } from '@/components/vendor/VendorTelegramChat'

interface TutorialVideo {
  _id: string
  key: string
  title: string
  description: string
  category: string
  videoUrl: string
  thumbnailUrl: string
}

// YouTube/Vimeo/Loom links need to render as an <iframe> embed; anything
// else is assumed to be a direct video file URL and renders in a plain
// <video> tag -- covers "whatever hosting the admin actually has" without
// needing a dedicated field to say which kind it is.
function isEmbedUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|loom\.com/i.test(url)
}

function toEmbedSrc(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return url
}

// Written walkthroughs standing in for tutorial videos until those are
// recorded/uploaded (console/admin/tutorial-videos) -- per explicit
// direction ("until we upload videos for now all our process and
// information put in help"). Each entry mirrors a real nav item/workflow.
const GUIDE_SECTIONS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Getting started',
    items: [
      { q: 'What do I need to do first?', a: 'Link your personal Telegram chat from Telegram Alerts -- it\'s how we send support replies, alerts, and (on Ultimate) automatic business reports until a mobile app exists. Generate a code there and scan it, or tap "Open in Telegram."' },
      { q: 'Where do I start a repair job?', a: 'Dashboard or Workorders -- click "Create Workorder", enter the customer + device details (brand/model can be typed and added on the fly), and save. The job stays open on one screen through intake, repair, and closure.' },
    ],
  },
  {
    title: 'Workorders',
    items: [
      { q: 'How do I add parts/labour to a job?', a: 'On the workorder screen, use the line-item Description field -- it suggests parts from your Service Center BOM price list, or lets you add a brand-new part on the spot (auto-fills HSN/rate/tax).' },
      { q: 'Why don\'t I see parts for a particular brand?', a: 'Service Center BOM parts filed under a Brand/Model only surface for a workorder on that same Brand/Model. Add the part under Service Center BOM with the matching Brand/Model, or leave it Universal/Any Model to show for every device.' },
      { q: 'Can I edit the IMEI/Serial after intake?', a: 'Yes -- the pencil icon next to IMEI on the workorder detail screen, any time before the job is closed.' },
      { q: 'How do I close a job and generate the invoice?', a: 'Once repair is complete, use Close Workorder -- it generates the customer invoice (GST or plain bill, based on whether a GSTIN is on file) automatically.' },
    ],
  },
  {
    title: 'Billing & Invoices',
    items: [
      { q: 'What\'s the difference between Sales Invoices and Financial Statement?', a: 'Sales Invoices is where you create/manage invoices (the form, list, mark-paid, print). Financial Statement is a read-only running ledger built FROM those invoices -- a chronological list with a running balance, for reconciliation, not editing.' },
      { q: 'When would I use Quotations vs Proforma Invoice vs Credit/Debit Note?', a: 'Quotation: a price estimate before work is confirmed. Proforma Invoice: a formal pre-payment request (not a tax invoice). Credit Note: reduces what a customer owes (a return/refund/correction). Debit Note: increases what they owe (an additional charge after the fact).' },
      { q: 'How do I get a UPI QR or bank details on my invoices?', a: 'Set your UPI ID and/or bank account in My Profile / Settings -- it then prints automatically on invoices (QR and bank details are mutually exclusive on one invoice; QR wins if both are set).' },
    ],
  },
  {
    title: 'Stock & Inventory',
    items: [
      { q: 'What\'s the difference between Warehouses, Inventory, and Stock Transfers?', a: 'Warehouses are your physical locations. Inventory is the actual stock quantity of each material at each warehouse. Stock Transfers moves quantity from one of your warehouses to another.' },
    ],
  },
  {
    title: 'Reports & Analytics',
    items: [
      { q: 'What\'s the difference between Reports, Analytics, and Report Builder?', a: 'Analytics is a fixed dashboard of charts (revenue, workorder trends). Reports is a hub of ready-made exports (CSV downloads with date filters). Report Builder (Pro and above) lets you build and save a fully custom report -- pick fields, filters, and a chart type yourself.' },
      { q: 'Can reports be sent to me automatically?', a: 'Yes, on the Ultimate plan -- set a Daily/Weekly/Monthly/Yearly schedule (with a time of day) on Telegram Alerts, and you\'ll get the report text plus a trend-chart image sent to your linked Telegram chat automatically.' },
    ],
  },
  {
    title: 'Sub-Vendors (Ultimate plan)',
    items: [
      { q: 'How do multi-center / sub-vendors work?', a: 'On the Ultimate plan, create a sub-vendor from Sub-Vendors -- each gets its own full login and Vendor ID. Only YOU (the parent) can switch into a sub-vendor\'s view (via the switcher at the top of the sidebar); a sub-vendor logging in directly can never see you or any sibling sub-vendor.' },
    ],
  },
]

function GuideAccordion() {
  const [openKey, setOpenKey] = useState<string | null>(null)
  return (
    <div className="space-y-8 mb-10">
      {GUIDE_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="eyebrow mb-3">{section.title}</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {section.items.map((item) => {
              const key = `${section.title}::${item.q}`
              const isOpen = openKey === key
              return (
                <button
                  key={key}
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors"
                >
                  <p className="text-sm font-medium text-ink">{item.q}</p>
                  {isOpen && <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{item.a}</p>}
                </button>
              )
            })}
          </Card>
        </div>
      ))}
    </div>
  )
}

function VideoPlayer({ video, onClose }: { video: TutorialVideo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-card shadow-card-lg max-w-3xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="h-section">{video.title}</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="aspect-video bg-black">
          {isEmbedUrl(video.videoUrl) ? (
            <iframe src={toEmbedSrc(video.videoUrl)} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          ) : (
            <video src={video.videoUrl} controls autoPlay className="w-full h-full" />
          )}
        </div>
        {video.description && <p className="px-5 py-3 text-sm text-ink-2">{video.description}</p>}
      </div>
    </div>
  )
}

export default function VendorHelpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg"><LoadingPanel label="Loading…" /></div>}>
      <VendorHelpContent />
    </Suspense>
  )
}

function VendorHelpContent() {
  const { data, isLoading } = useSWR('/api/vendor/tutorial-videos')
  const videos: TutorialVideo[] = data?.success ? data.videos || [] : []
  const searchParams = useSearchParams()
  const [playing, setPlaying] = useState<TutorialVideo | null>(null)

  useEffect(() => {
    const wantedKey = searchParams?.get('video')
    if (!wantedKey || videos.length === 0) return
    const match = videos.find((v) => v.key === wantedKey)
    if (match) setPlaying(match)
  }, [searchParams, videos])

  const byCategory = videos.reduce<Record<string, TutorialVideo[]>>((acc, v) => {
    (acc[v.category] ??= []).push(v)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader eyebrow="Support" title="Help & Tutorials" description="Short videos walking through the most common tasks." />

      <GuideAccordion />

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : videos.length === 0 ? (
        <EmptyState kind="empty" title="Video tutorials coming soon" description="Written guides above cover everything for now -- videos are on the way." />
      ) : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category}>
              <h2 className="eyebrow mb-3">{category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((video) => (
                  <button key={video._id} onClick={() => setPlaying(video)} className="text-left">
                    <Card className="overflow-hidden hover:border-border-strong transition-colors">
                      <div className="aspect-video bg-surface-2 flex items-center justify-center relative">
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                        ) : (
                          <PlayCircle className="w-10 h-10 text-ink-3" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors">
                          <PlayCircle className="w-10 h-10 text-white opacity-0 hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-ink">{video.title}</p>
                        {video.description && <p className="text-xs text-ink-3 mt-0.5 line-clamp-2">{video.description}</p>}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {playing && <VideoPlayer video={playing} onClose={() => setPlaying(null)} />}

      <div className="mt-10">
        <h2 className="eyebrow mb-3">Still stuck? Ask us directly</h2>
        <VendorTelegramChat />
      </div>
    </div>
  )
}
