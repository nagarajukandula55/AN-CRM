/**
 * ONE-TIME: create inactive placeholder businesses for categories beyond
 * E-Commerce/Service that are coming later (per explicit direction:
 * "apart from service and ecommerce set remaining business and inactive
 * for now, later i'll add actual names and activate them").
 *
 * Each placeholder is created with isActive: false (hidden from every
 * business switcher/menu -- /api/auth/me and /api/businesses/list both
 * filter to isActive: true -- but still visible, editable, and
 * activatable from Admin > Businesses) and its modules[] pre-seeded from
 * the matching template in core/access/moduleTemplates.ts, so the moment
 * it's renamed and activated its menu is already correct. INSERT-ONLY:
 * skips any category that already has a business (matched by tenantKey
 * prefix), safe to re-run.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/createPlaceholderBusinesses.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import { bootstrapBusiness } from "../src/services/businessBootstrap.service";
import { STATIC_MODULES } from "../src/components/sidebar-nav";
import { isEnabledUnderTemplate, type ModuleTemplateKey } from "../src/core/access/moduleTemplates";

const PLACEHOLDERS: { name: string; template: ModuleTemplateKey; tenantPrefix: string }[] = [
  { name: "Logistics (placeholder — rename me)", template: "LOGISTICS", tenantPrefix: "placeholder-logistics" },
  { name: "Laundry (placeholder — rename me)", template: "LAUNDRY", tenantPrefix: "placeholder-laundry" },
  { name: "Restaurant (placeholder — rename me)", template: "RESTAURANT", tenantPrefix: "placeholder-restaurant" },
  { name: "Travels (placeholder — rename me)", template: "TRAVELS", tenantPrefix: "placeholder-travels" },
  { name: "Transports (placeholder — rename me)", template: "TRANSPORTS", tenantPrefix: "placeholder-transports" },
  { name: "Wholesale (placeholder — rename me)", template: "WHOLESALE", tenantPrefix: "placeholder-wholesale" },
  { name: "Retail (placeholder — rename me)", template: "RETAIL", tenantPrefix: "placeholder-retail" },
  { name: "Software (placeholder — rename me)", template: "SOFTWARE", tenantPrefix: "placeholder-software" },
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

  for (const p of PLACEHOLDERS) {
    const existing = await Business.findOne({ tenantKey: new RegExp(`^${p.tenantPrefix}-`) });
    if (existing) {
      console.log(`Skipping "${p.name}" — placeholder already exists (id ${existing._id}).`);
      continue;
    }

    const business = await bootstrapBusiness({ name: p.name });
    await Business.updateOne(
      { _id: business._id },
      {
        $set: {
          isActive: false,
          modules: buildModulesForTemplate(p.template),
          tenantKey: `${p.tenantPrefix}-${Date.now().toString(36)}`,
        },
      }
    );
    console.log(`Created inactive placeholder "${p.name}" (id ${business._id}), template ${p.template}.`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
