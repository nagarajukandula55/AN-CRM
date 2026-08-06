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
import fs from "fs";
import path from "path";
import { connectDB } from "../src/lib/mongodb";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const APP_NAME = "an-crm";
const APP_DIR = path.join(__dirname, "..", "src", "app");

// Walks every literal page.tsx under src/app and derives its route --
// this is the actual complete page list (149+ routes as of this writing),
// vs. the curated ~55 ModuleDefinition nav entries below, which only cover
// pages deliberately added to a sidebar/module list. "Register every page,
// not just a few" -- this closes that gap: every route.tsx-backed page
// gets a pageregistry row even if it never got a ModuleDefinition. Route
// groups (parens) are stripped (they don't appear in the URL); dynamic
// segments ([id], [[...id]]) are kept as literal placeholders so the
// registry entry reads like a real route pattern, not a resolved URL.
function walkPages(dir: string, base = ""): { route: string; segment: string }[] {
  const out: { route: string; segment: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name === "api" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      out.push(...walkPages(full, isGroup ? base : `${base}/${entry.name}`));
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      // An OPTIONAL catch-all segment ([[...id]]) matches its own PARENT
      // path too (e.g. console/crm/jobsheets/sc/[[...id]]/page.tsx serves
      // BOTH /console/crm/jobsheets/sc and /console/crm/jobsheets/sc/<id>
      // from one file) -- registering the literal bracketed path meant
      // this page (and any other optional-catch-all page, e.g. the SC
      // single-screen workorder flow) never matched the real URL anyone
      // actually navigates to or that a role's allowedPages would
      // reference. Strip it to the bare parent route instead. A REQUIRED
      // dynamic segment ([id], [...slug]) is left as-is -- its parent path
      // is a genuinely different page (e.g. /console/business is the list,
      // /console/business/[id] is the detail view), so collapsing it would
      // wrongly merge two distinct pages into one registry row.
      const route = (base.replace(/\/\[\[\.\.\..*?\]\]$/, "") || base) || "/";
      const segment = route.split("/").filter(Boolean).pop() || "home";
      out.push({ route, segment });
    }
  }
  return out;
}

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

  console.log(`\nModule-registry sync done (${modules.length} rows). Now scanning every literal page.tsx route...`);

  // Second pass: every literal page.tsx, minus routes already covered
  // above by a ModuleDefinition (avoid a duplicate row for the same
  // route -- the module-registry entry has a cleaner curated label).
  const allPages = walkPages(APP_DIR);
  const coveredRoutes = new Set((modules as any[]).map((m) => m.route));
  const uncovered = allPages.filter((p) => !coveredRoutes.has(p.route));
  console.log(`Found ${allPages.length} total page(s), ${uncovered.length} not already in the module registry.`);

  const existingRes2 = await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry?limit=1000&search=app:${APP_NAME}`, { headers });
  const existing2 = existingRes2.ok ? (await existingRes2.json()).items || [] : [];
  const existingByRoute2 = new Map(existing2.map((p: any) => [p.route, p]));

  for (const p of uncovered) {
    const payload = {
      app: APP_NAME,
      pageKey: p.route.replace(/\//g, ".").replace(/^\.+/, "") || "home",
      route: p.route,
      label: `AN-CRM: ${p.segment}`,
    };
    const existingRow: any = existingByRoute2.get(p.route);
    if (existingRow?._id) {
      await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry/${existingRow._id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      console.log(`  updated ${p.route}`);
    } else {
      await fetch(`${CENTRAL_API_URL}/api/v1/pageregistry`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      console.log(`  created ${p.route}`);
    }
  }

  console.log("\nDone. See central-api's admin dashboard, Access tab, \"Page registry\" panel.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
