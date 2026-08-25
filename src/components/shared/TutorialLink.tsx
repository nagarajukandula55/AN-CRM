'use client'

/**
 * Contextual "Watch tutorial" shortcut for a feature page -- links to
 * /vendor/help?video=<videoKey>, which auto-opens that video's player on
 * load. Doesn't check whether the video actually exists/is published
 * (that's a cheap admin-catalog lookup, not worth a request from every
 * page that renders this) -- an unmatched key just lands on the Help
 * Center with nothing auto-playing, same as browsing there directly.
 */

import Link from 'next/link'
import { PlayCircle } from 'lucide-react'

export function TutorialLink({ videoKey, label = 'Watch tutorial' }: { videoKey: string; label?: string }) {
  return (
    <Link
      href={`/vendor/help?video=${encodeURIComponent(videoKey)}`}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
    >
      <PlayCircle className="w-3.5 h-3.5" /> {label}
    </Link>
  )
}
