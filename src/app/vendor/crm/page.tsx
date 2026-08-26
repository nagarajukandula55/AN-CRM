import { redirect } from 'next/navigation'

// CRM Overview is now the vendor Dashboard itself (/vendor) -- see
// vendor/page.tsx's own comment. Kept as a redirect so the existing
// Engineer/CCO login-redirect target (src/app/login/page.tsx) and any
// other link still pointing at /vendor/crm keeps working.
export default function VendorCrmRedirect() {
  redirect('/vendor')
}
