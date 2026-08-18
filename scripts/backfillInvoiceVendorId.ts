/**
 * One-time backfill for the bug fixed in api/crm/jobsheets/[id]/close/route.ts:
 * every SalesInvoice created from a CRM job sheet close never had vendorId
 * set, so every per-vendor Telegram report (lib/telegramReport.ts's
 * computePeriodNumbers, which filters SalesInvoice by vendorId) always
 * computed revenue as 0 for these invoices, no matter how many were
 * actually paid that day.
 *
 * Finds every SalesInvoice with sourceOrderId "CRM_JOBSHEET:<id>" and no
 * vendorId, looks up that job sheet's own vendorId, and sets it on the
 * invoice. Uses the raw MongoDB driver, not the Mongoose model, same
 * reasoning as scripts/fixEmptyBrandShortcuts.ts.
 *
 *   npx tsx --env-file=.env.local scripts/backfillInvoiceVendorId.ts          (dry run)
 *   npx tsx --env-file=.env.local scripts/backfillInvoiceVendorId.ts --confirm (writes)
 */
import { MongoClient, ObjectId } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = new MongoClient(uri);
  await client.connect();

  const confirm = process.argv.includes("--confirm");
  const invoices = client.db().collection("salesinvoices");
  const jobSheets = client.db().collection("crmjobsheets");

  const affected = await invoices
    .find({ sourceOrderId: { $regex: /^CRM_JOBSHEET:/ }, vendorId: { $in: [null, undefined] } })
    .project({ invoiceNumber: 1, sourceOrderId: 1 })
    .toArray();

  if (affected.length === 0) {
    console.log("No CRM-jobsheet invoices missing vendorId. Nothing to do.");
    await client.close();
    return;
  }

  console.log(`Found ${affected.length} invoice(s) missing vendorId.`);
  let fixed = 0;
  let skipped = 0;

  for (const inv of affected) {
    const jobSheetId = String(inv.sourceOrderId).split(":")[1];
    if (!jobSheetId || !ObjectId.isValid(jobSheetId)) {
      console.log(`  - ${inv.invoiceNumber}: unparseable sourceOrderId "${inv.sourceOrderId}", skipping`);
      skipped++;
      continue;
    }
    const jobSheet = await jobSheets.findOne({ _id: new ObjectId(jobSheetId) }, { projection: { vendorId: 1 } });
    if (!jobSheet?.vendorId) {
      console.log(`  - ${inv.invoiceNumber}: job sheet ${jobSheetId} has no vendorId either, skipping`);
      skipped++;
      continue;
    }
    console.log(`  - ${inv.invoiceNumber}: -> vendorId ${jobSheet.vendorId}`);
    if (confirm) {
      await invoices.updateOne({ _id: inv._id }, { $set: { vendorId: jobSheet.vendorId } });
      fixed++;
    }
  }

  if (confirm) {
    console.log(`\nFixed ${fixed} invoice(s), skipped ${skipped}.`);
  } else {
    console.log(`\nDry run only -- re-run with --confirm to write ${affected.length - skipped} change(s).`);
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
