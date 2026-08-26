import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongodb'
import { resolveLandingPath } from '@/core/access/vendorAccess.service'
import HomePage from '@/components/marketing/CrmHomePage'

/**
 * Root page — Server Component (was 'use client', a bare loading spinner
 * on first paint while it fetched /api/auth/landing client-side to decide
 * where to send an authenticated visitor). That meant search engines and
 * AI answer engines (GEO) saw a blank spinner shell instead of the actual
 * marketing content on "/", the single most important page for organic
 * discovery. Reported live as part of a broader SEO pass.
 *
 * Now resolves the exact same landing rule (resolveLandingPath, the same
 * function api/auth/landing already wrapped) directly from the verified
 * x-user-id/x-is-super-admin headers middleware.ts sets -- no client
 * round trip needed at all -- and redirects server-side BEFORE ever
 * rendering the marketing page for a logged-in visitor. An anonymous
 * visitor (or a crawler, which never carries an an_token cookie) gets the
 * full marketing HTML on the very first response.
 */
export default async function RootPage() {
  const h = await headers()
  const userId = h.get('x-user-id')

  if (userId) {
    let landingPath: string | null = null
    try {
      await connectDB()
      const isSuperAdmin = h.get('x-is-super-admin') === 'true'
      landingPath = await resolveLandingPath(userId, isSuperAdmin)
    } catch {
      // On any resolution error, fail open to the marketing page rather
      // than leaving a logged-in visitor stuck -- same reasoning the old
      // client-side version's catch block used.
      landingPath = null
    }
    // redirect() throws internally (NEXT_REDIRECT) -- must stay OUTSIDE
    // the try/catch above, or that throw gets silently swallowed and the
    // redirect never actually happens.
    if (landingPath) redirect(landingPath)
  }

  return <HomePage />
}
