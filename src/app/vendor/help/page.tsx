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

      {isLoading ? (
        <LoadingPanel label="Loading…" />
      ) : videos.length === 0 ? (
        <EmptyState kind="empty" title="No tutorials published yet" description="Check back soon -- videos are on the way." />
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
    </div>
  )
}
