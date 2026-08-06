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
 */
export default function RegisterRedirect() {
  redirect("/partner-signup");
}
