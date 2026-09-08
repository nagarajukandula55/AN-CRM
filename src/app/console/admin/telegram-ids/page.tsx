'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /console/admin/telegram (Chat IDs tab).
export default function TelegramIdsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/admin/telegram?tab=chat-ids')
  }, [router])
  return null
}
