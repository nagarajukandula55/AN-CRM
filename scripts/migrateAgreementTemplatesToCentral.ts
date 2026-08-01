/**
 * ONE-TIME MIGRATION: registers the "agreementtemplates" dataset in
 * central-api (if not already) and pushes this app's INDIAN_LAW_TEMPLATES
 * content (api/agreements/templates/route.ts) into it, so every AN Group
 * app reads the same catalog going forward instead of each keeping its own
 * local copy. Safe to re-run: skips any template whose `type` already
 * exists in central-api instead of duplicating it.
 *
 * Requires CENTRAL_API_URL and ADMIN_API_KEY (central-api's admin key, NOT
 * this app's regular CENTRAL_API_KEY site key -- registering a new dataset
 * is an admin-only action) in the environment.
 *
 *   npx tsx --env-file=.env.local scripts/migrateAgreementTemplatesToCentral.ts
 */
import { INDIAN_LAW_TEMPLATES } from "../src/lib/agreementTemplateSeeds";

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

async function main() {
  if (!CENTRAL_API_URL) throw new Error("CENTRAL_API_URL is not set");
  if (!ADMIN_API_KEY) throw new Error("ADMIN_API_KEY is not set (central-api's admin key, for dataset registration)");

  const headers = { "x-api-key": ADMIN_API_KEY, "Content-Type": "application/json" };

  console.log('Registering "agreementtemplates" dataset in central-api...');
  const registerRes = await fetch(`${CENTRAL_API_URL}/api/v1/_meta/datasets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "agreementtemplates" }),
  });
  // 201 = newly registered, 200/409-ish upsert behavior also fine -- addDataset
  // itself is idempotent (upserts by name), so any non-5xx here is OK.
  console.log(`  -> ${registerRes.status}`);

  const existingRes = await fetch(`${CENTRAL_API_URL}/api/v1/agreementtemplates?limit=200`, { headers });
  const existing = existingRes.ok ? (await existingRes.json()).items || [] : [];
  const existingTypes = new Set(existing.map((t: any) => t.type));

  for (const template of INDIAN_LAW_TEMPLATES) {
    if (existingTypes.has(template.type)) {
      console.log(`  skip ${template.type} (already exists in central-api)`);
      continue;
    }
    const res = await fetch(`${CENTRAL_API_URL}/api/v1/agreementtemplates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...template, assignedBusinessIds: [], isActive: true }),
    });
    console.log(`  ${res.ok ? "created" : "FAILED"} ${template.type} (${res.status})`);
  }

  console.log("\nDone. Assign templates to specific businesses (or leave assignedBusinessIds empty for \"available to all\") from central-api's admin dashboard, Agreements tab.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
