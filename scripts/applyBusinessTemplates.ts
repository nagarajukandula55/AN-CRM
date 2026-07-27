/**
 * ONE-TIME: apply the matching module template to the real, already-live
 * businesses (E Commerce -> ECOMMERCE, Service Flow -> SERVICE, AN Group ->
 * PLATFORM). The "Apply Template" buttons added to admin/business/[id]'s
 * Modules section do exactly this bulk pre-check, but require a manual
 * click + Save per business -- this runs the same logic directly so the
 * live menus actually reflect the plan instead of still being unfiltered.
 * Non-destructive/reversible: same checkboxes the admin UI exposes, still
 * editable by hand afterward.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/applyBusinessTemplates.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import { STATIC_MODULES } from "../src/components/sidebar-nav";
import { isEnabledUnderTemplate, type ModuleTemplateKey } from "../src/core/access/moduleTemplates";

const ASSIGNMENTS: { name: string; template: ModuleTemplateKey }[] = [
  { name: "E Commerce", template: "ECOMMERCE" },
  { name: "Service Flow", template: "SERVICE" },
  { name: "AN Group", template: "PLATFORM" },
];

function buildModulesForTemplate(template: ModuleTemplateKey) {
  return STATIC_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    route: m.route,
    icon: m.icon,
    enabled: isEnabledUnderTemplate(m.key, template),
  }));
}

async function main() {
  await connectDB();

  for (const a of ASSIGNMENTS) {
    const biz = await Business.findOne({ name: a.name });
    if (!biz) {
      console.log(`Skipping "${a.name}" — not found.`);
      continue;
    }
    const modules = buildModulesForTemplate(a.template);
    await Business.updateOne({ _id: biz._id }, { $set: { modules } });
    const enabled = modules.filter((m) => m.enabled).length;
    console.log(`Applied ${a.template} template to "${a.name}" (${enabled}/${modules.length} modules enabled).`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
