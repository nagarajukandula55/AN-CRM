'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /console/admin/telegram (Notifications Log tab).
export default function TelegramLogRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/admin/telegram?tab=log')
  }, [router])
  return null
}
