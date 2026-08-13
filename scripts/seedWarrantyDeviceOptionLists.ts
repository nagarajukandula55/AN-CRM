/**
 * ONE-TIME: seed the WARRANTY_STATUS and DEVICE_APPEARANCE CrmOptionList
 * rows (global defaults, businessId: null) that back the Job Sheet form's
 * Warranty Status / Device Appearance dropdowns, now that those are
 * admin-editable master data instead of hardcoded <select> options (see
 * src/models/CrmOptionList.ts, src/app/console/admin/option-lists/page.tsx).
 *
 * The API (/api/crm-option-lists GET) already auto-seeds these on first
 * request via its own DEFAULTS table, so this script is a belt-and-braces
 * explicit seed for environments where that route hasn't been hit yet --
 * safe to run any time: additive-only, skips a code that already exists for
 * that listType, never duplicates on re-run.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedWarrantyDeviceOptionLists.ts           (dry run)
 *   npx tsx --env-file=.env.local scripts/seedWarrantyDeviceOptionLists.ts --confirm  (writes)
 */

import { connectDB } from "../src/lib/mongodb";
import CrmOptionList, { type CrmOptionListType } from "../src/models/CrmOptionList";

const SEED: Record<CrmOptionListType extends string ? "WARRANTY_STATUS" | "DEVICE_APPEARANCE" : never, { code: string; label: string }[]> = {
  WARRANTY_STATUS: [
    { code: "IW", label: "In Warranty" },
    { code: "OOW", label: "Out of Warranty" },
  ],
  DEVICE_APPEARANCE: [
    { code: "GOOD", label: "Good" },
    { code: "USED", label: "Used" },
    { code: "DENTS", label: "Dents/Scratches" },
    { code: "BROKEN", label: "Broken/Damaged" },
  ],
};

async function main() {
  const confirm = process.argv.includes("--confirm");

  await connectDB();

  let toCreate = 0;
  let created = 0;
  let skipped = 0;

  for (const [listType, items] of Object.entries(SEED) as [keyof typeof SEED, { code: string; label: string }[]][]) {
    for (let i = 0; i < items.length; i++) {
      const { code, label } = items[i];
      const exists = await CrmOptionList.findOne({ listType, businessId: null, code });
      if (exists) {
        skipped++;
        console.log(`  SKIP  ${listType} ${code} (already exists)`);
        continue;
      }
      toCreate++;
      if (confirm) {
        await CrmOptionList.create({
          listType,
          businessId: null,
          code,
          label,
          sortOrder: i,
          isActive: true,
        });
        created++;
        console.log(`  CREATE ${listType} ${code} = "${label}"`);
      } else {
        console.log(`  WOULD CREATE ${listType} ${code} = "${label}"`);
      }
    }
  }

  if (!confirm) {
    console.log(`\nDry run: ${toCreate} row(s) would be created, ${skipped} already exist. Re-run with --confirm to write.`);
  } else {
    console.log(`\nDone: ${created} row(s) created, ${skipped} already existed.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
