/**
 * ONE-TIME: registers AN Technologies (the software marketplace at
 * github.com/nagarajukandula55/an-technologies) as a Vendor under Native's
 * ecommerce Business in ANgroup — per explicit direction to give it
 * visibility inside the business it's meant to integrate with, the same
 * way any real vendor is onboarded, rather than tracking it only outside
 * the platform.
 *
 * Uses the same global vendorId generator as the real vendor-onboarding
 * route (api/vendors/route.ts) so this behaves identically to any other
 * vendor in reports/search/numbering — not a fake or shortcut record.
 * Created directly at status ACTIVE (skipping the applied->approved
 * pipeline) since there is no actual outside applicant here — an admin
 * is registering a known, already-decided internal vendor, the same
 * shortcut createAdminOwner.ts and createSuperAdmin.ts take for their own
 * one-time bootstrap records.
 *
 * INSERT-ONLY: safe to re-run — skips if a VendorProfile for this
 * businessId + companyName already exists.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedAnTechnologiesVendor.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import VendorProfile from "../src/models/VendorProfile";
import { generateGlobalDocumentNumber } from "../src/core/numbering/numberingService";

// Same hardcoded Native storefront Business._id used by api/contact/route.ts's
// DEFAULT_BUSINESS_ID and services/order.service.ts's NATIVE_BUSINESS_ID.
const NATIVE_BUSINESS_ID = "6a4abddcf35feedb2392f556";

const COMPANY_NAME = "AN Technologies";

async function main() {
  await connectDB();

  const business = await Business.findById(NATIVE_BUSINESS_ID).lean();
  if (!business) {
    throw new Error(
      `Native's Business (${NATIVE_BUSINESS_ID}) was not found — this vendor record is meant to live ` +
        `under the real ecommerce business, so this script refuses to create one against a missing business.`
    );
  }

  const existing = await VendorProfile.findOne({
    businessId: NATIVE_BUSINESS_ID,
    companyName: COMPANY_NAME,
    isDeleted: false,
  }).lean();

  if (existing) {
    console.log(`AN Technologies vendor already exists: ${(existing as any).vendorId}`);
    return;
  }

  const { value: vendorId } = await generateGlobalDocumentNumber("VENDOR", NATIVE_BUSINESS_ID);

  const vendor = await VendorProfile.create({
    businessId: NATIVE_BUSINESS_ID,
    vendorId,
    companyName: COMPANY_NAME,
    contactPerson: "AN Technologies Team",
    website: "https://github.com/nagarajukandula55/an-technologies",
    category: "Software / Digital Tools",
    businessType: "Software Marketplace",
    notes:
      "Internal AN Group property (github.com/nagarajukandula55/an-technologies) — a software " +
      "marketplace selling per-tool/bundle-priced utilities, a Business Suite, and AN Dev Studio. " +
      "Registered here for visibility under Native's ecommerce business, not as a physical-goods " +
      "supplier.",
    status: "ACTIVE",
    isApproved: true,
    isDeleted: false,
    creditLimit: 0,
    paymentTerms: "N/A",
  });

  console.log(`Created AN Technologies vendor: ${vendor.vendorId} (${vendor._id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
