'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /console/admin/system-config (Custom Fields tab) -- kept
// as a redirect stub so any existing bookmark/link still lands somewhere
// useful instead of 404ing.
export default function CustomFieldsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/console/admin/system-config?tab=custom-fields')
  }, [router])
  return null
}
