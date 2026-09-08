'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /console/admin/telegram (Users & Groups tab).
export default function TelegramUsersRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/admin/telegram?tab=users')
  }, [router])
  return null
}
