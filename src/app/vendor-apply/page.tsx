import { redirect } from "next/navigation";

/**
 * This older two-step vendor application form (register elsewhere first,
 * then come back and type in your "User ID") has been retired in favor of
 * a single, unambiguous entry point: /partner-signup does account
 * creation and the business application in one guided flow, no
 * pre-registered User ID required. Forwards ?businessId= (the one query
 * param the old form read) in case any existing shared link still
 * includes it.
 */
export default async function VendorApplyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const params = await searchParams;
  redirect(params.businessId ? `/partner-signup?businessId=${encodeURIComponent(params.businessId)}` : "/partner-signup");
}
