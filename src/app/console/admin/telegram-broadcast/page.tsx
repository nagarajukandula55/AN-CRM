'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /console/admin/telegram (Broadcast tab).
export default function TelegramBroadcastRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/admin/telegram?tab=broadcast')
  }, [router])
  return null
}
