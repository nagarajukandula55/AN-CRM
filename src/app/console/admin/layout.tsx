import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Hard server-side gate on the ENTIRE /console/admin/* tree -- Super
 * Admin (and platform staff) only. Before this file existed, there was
 * NO role check anywhere above the individual page level: src/app/
 * console/layout.tsx (the parent) has none either, and most admin pages
 * (e.g. console/admin/settings/page.tsx) only used `isSuperAdmin` to
 * conditionally hide a few UI sections -- the page itself, and the
 * underlying /api/businesses/[id] GET it calls, rendered/returned the
 * real platform Business record (name, address, support-contact numbers,
 * GSTIN) for ANY logged-in user, including a marketplace VENDOR, since a
 * vendor is a real BusinessMember of the shared platform Business.
 * Reported live: a vendor account reached crm.angroup.in/console/admin/
 * settings directly and could view (and, via the Save button, WRITE)
 * the real admin Business Profile and Support Contact fields.
 *
 * This is a Server Component reading the x-is-super-admin/x-is-platform-
 * staff headers middleware.ts already sets from the verified JWT --
 * cannot be bypassed by disabling JS or hitting the URL directly, unlike
 * a client-side useEffect redirect (which also has a flash-of-real-
 * content window before it fires). Every underlying admin API route
 * should ALSO enforce this itself (defense in depth, never trust a UI
 * gate alone) -- this layout closes the page-level hole specifically.
 */
export default async function ConsoleAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const isSuperAdmin = headersList.get("x-is-super-admin") === "true";
  const isPlatformStaff = headersList.get("x-is-platform-staff") === "true";

  if (!isSuperAdmin && !isPlatformStaff) {
    redirect("/login");
  }

  return <>{children}</>;
}
