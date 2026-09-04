import { redirect } from "next/navigation";

/**
 * Redirects to the single public signup surface, /partner-signup, per
 * explicit direction ("remove user signup entirely, only vendor signup
 * should be there"). This page previously offered a generic customer
 * signup tab alongside a vendor-application tab -- both are gone now:
 * a vendor's staff no longer self-register here either, they're created
 * directly by their vendor's Owner/Manager via /api/vendor/staff/create
 * (no self-registration step at all). Mirrors the earlier /vendor-apply
 * -> /partner-signup redirect (see that file's own history) -- the
 * underlying /api/auth/register endpoint is untouched and still used
 * internally by partner-signup's own step 1.
 *
 * Forwards the incoming query string (e.g. /pricing's own "?plan=pro&
 * mode=sc" links, or a referral "?ref=<code>") -- this used to redirect
 * to a bare "/partner-signup" with no params at all, silently dropping
 * both a pre-selected plan and any referral code on every link that
 * pointed through here instead of straight at /partner-signup.
 */
export default async function RegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) qs.set(key, value[0]);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/partner-signup?${suffix}` : "/partner-signup");
}
