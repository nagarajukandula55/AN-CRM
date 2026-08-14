'use client'

import { useBrowserPush } from '@/lib/hooks/useBrowserPush'

/** Renders nothing -- just registers this browser for Web Push on mount (see useBrowserPush). A plain client component so server-component layouts (e.g. app/vendor/layout.tsx) can mount it without becoming client themselves. */
export default function BrowserPushRegister() {
  useBrowserPush(true)
  return null
}
