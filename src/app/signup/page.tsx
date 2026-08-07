import { redirect } from "next/navigation";

/**
 * Redirects to the single public signup surface, /partner-signup -- this
 * page was an earlier, separate vendor-type picker that predated
 * /partner-signup's own type=SC|BRAND|POS support, leaving two
 * overlapping signup entry points. Consolidated per explicit direction
 * ("remove user signup entirely, only vendor signup should be there").
 */
export default function SignupRedirect() {
  redirect("/partner-signup");
}
