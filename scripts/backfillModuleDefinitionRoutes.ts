/**
 * ONE-OFF: fixes ModuleDefinition.route values already stored in the live
 * database that were seeded with the wrong "/admin/..." prefix (copied
 * from ANgroup's own seed data -- this app's real routes live under
 * "/console/...", not "/admin/..."). scripts/seedSystemModules.ts itself
 * is already fixed for future/fresh seeds; this backfills documents that
 * were seeded before that fix.
 *
 * Concretely affects sidebar.tsx:567's `m.route === "/console"` dashboard
 * check, which silently never matched while routes were wrong -- and will
 * matter again for the new central-api page registry sync
 * (migratePageRegistryToCentral.ts), which reads these routes directly.
 *
 * Dry-run by default. Pass --confirm to actually update.
 *
 *   npx tsx --env-file=.env.local scripts/backfillModuleDefinitionRoutes.ts
 *   npx tsx --env-file=.env.local scripts/backfillModuleDefinitionRoutes.ts --confirm
 */
import { connectDB } from "../src/lib/mongodb";
import ModuleDefinition from "../src/core/module-registry/ModuleDefinition.model";

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  await connectDB();

  const stale = await ModuleDefinition.find({ route: { $regex: "^/admin" } }).select("key label route").lean();

  if (stale.length === 0) {
    console.log("No stale routes found -- nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${stale.length} ModuleDefinition(s) with a stale "/admin" route:`);
  stale.forEach((m: any) => console.log(`  ${m.key.padEnd(20)} ${m.route}  ->  ${m.route.replace(/^\/admin/, "/console")}`));

  if (!CONFIRM) {
    console.log("\nDry run only -- re-run with --confirm to actually fix.");
    process.exit(0);
  }

  for (const m of stale as any[]) {
    await ModuleDefinition.updateOne({ _id: m._id }, { $set: { route: m.route.replace(/^\/admin/, "/console") } });
  }

  console.log(`\nFixed ${stale.length} route(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
