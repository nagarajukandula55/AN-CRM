/**
 * Reads a live-editable agreement template body from central-api's
 * Agreement Templates store (Admin > Agreements, `/api/v1/agreementtemplates`
 * -- shared across every AN Group app, per its own on-page description).
 * Returns null (never throws) if central-api is unreachable, the type
 * isn't configured yet, it's inactive, its content is blank, or it's
 * assigned to specific OTHER businesses (assignedBusinessIds non-empty
 * and not including this one) -- every one of those is "fall back to the
 * caller's own hardcoded template", not an error.
 *
 * Content may contain {{placeholder}} tokens; substituteVars fills them
 * in from the provided map, leaving any unmatched token as literal text
 * (visibly wrong rather than silently blank, so a missing/misspelled
 * variable is easy to spot when editing the template centrally).
 */
export async function getCentralAgreementTemplate(
  type: string,
  businessId: string | undefined | null,
  vars: Record<string, string> = {}
): Promise<string | null> {
  const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
  const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
  if (!CENTRAL_API_URL) return null;
  try {
    const res = await fetch(`${CENTRAL_API_URL}/api/v1/agreementtemplates?limit=200`, {
      headers: { "x-api-key": CENTRAL_API_KEY || "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data?.items || [];
    const match = items.find((t) => {
      if (t.type !== type || t.isActive === false || !String(t.content || "").trim()) return false;
      const assigned: string[] = Array.isArray(t.assignedBusinessIds) ? t.assignedBusinessIds : [];
      if (assigned.length === 0) return true;
      return !!businessId && assigned.includes(String(businessId));
    });
    if (!match) return null;
    return substituteVars(String(match.content), vars);
  } catch {
    return null;
  }
}

function substituteVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (full, key) => (key in vars ? vars[key] : full));
}
