/**
 * ONE-TIME (re-runnable) MIGRATION: pushes this app's platform-wide
 * ModuleDefinition rows (businessId: null -- the system module/page list,
 * see scripts/seedSystemModules.ts) into central-api's shared
 * "pageregistry" dataset, so a role's allowed pages can be picked from a
 * real, live list instead of hand-typed page names -- and so a page used
 * by multiple apps can be seen as such in one place.
 *
 * Idempotent: upserts by {app, route} instead of duplicating on re-run
 * (run this again any time AN-CRM's own module list changes).
 *
 * Requires CENTRAL_API_URL and ADMIN_API_KEY (central-api's admin key,
 * for registering the dataset the first time -- same requirement as
 * migrateAgreementTemplatesToCentral.ts).
 *
 *   npx tsx --env-file=.env.local scripts/migratePageRegistryToCentral.ts
 */
import { connectDB } from "../src/lib/mongodb";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const APP_NAME = "an-crm";

async function main() {
  if (!CENTRAL_API_URL) throw new Error("CENTRAL_API_URL is not set");
  if (!ADMIN_API_KEY) throw new Error("ADMIN_API_KEY is not set (central-api's admin key)");

  await connectDB();
  const headers = { "x-api-key": ADMIN_API_KEY, "Content-Type": "application/json" };

  console.log('Registering "pageregistry" dataset in central-api...');
  const registerRes = await fetch(`${CENTRAL_API_URL}/api/v1/_meta/datasets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "pageregistry" }),
  });
  console.log(`  -> ${registerRes.status}`);

  // Platform-wide modules only (businessId: null) -- this app's canonical
  // page/route list, same set seedSystemModules.ts maintains. Per-business
  // overrides aren't synced here; the registry is meant to answer "what
  // pages does an-crm have", not "what does business X see today".
  const modules = await ModuleDefinition.find({ businessId: null }).select("key label route").lean();
  console.log(`Found ${modules.length} platform-wide module(s) in AN-CRM.`);

  const existingRes = await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry?limit=500&search=app:${APP_NAME}`, { headers });
  const existing = existingRes.ok ? (await existingRes.json()).items || [] : [];
  const existingByRoute = new Map(existing.map((p: any) => [p.route, p]));

  for (const m of modules as any[]) {
    // "add business name to page display name" -- label is prefixed with
    // the app name so a shared cross-app list stays identifiable at a
    // glance (e.g. "AN-CRM: Vendors" vs "ANgroup: Vendors" are visibly
    // different rows even though both use the key "vendors").
    const payload = {
      app: APP_NAME,
      pageKey: m.key,
      route: m.route,
      label: `AN-CRM: ${m.label}`,
    };

    const existingRow: any = existingByRoute.get(m.route);
    if (existingRow?._id) {
      await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry/${existingRow._id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      console.log(`  updated ${m.route}`);
    } else {
      await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      console.log(`  created ${m.route}`);
    }
  }

  console.log("\nDone. See central-api's admin dashboard, Access tab, \"Page registry\" panel.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
