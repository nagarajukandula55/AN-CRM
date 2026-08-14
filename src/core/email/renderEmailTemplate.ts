import EmailTemplate from "@/models/EmailTemplate";

/**
 * Looks up a super-admin-saved override for one email occasion (see
 * emailOccasions.ts) and renders its {{token}} placeholders -- called from
 * each services/email/resend.service.ts sender before falling back to its
 * own hardcoded subject/html. Returns:
 *  - null: no override saved -- caller uses its own hardcoded fallback.
 *  - "disabled": admin explicitly turned this occasion off -- caller must
 *    skip sending entirely (mirrors the Telegram template system's kill
 *    switch).
 *  - {subject, html}: the rendered override to send instead.
 */
export async function renderEmailTemplate(
  key: string,
  tokens: Record<string, string>
): Promise<{ subject: string; html: string } | "disabled" | null> {
  try {
    const tmpl = await EmailTemplate.findOne({ key: key.toUpperCase() }).lean<any>();
    if (!tmpl) return null;
    if (tmpl.enabled === false) return "disabled";
    const render = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => tokens[name] ?? "");
    return { subject: render(tmpl.subject), html: render(tmpl.html) };
  } catch {
    return null;
  }
}
