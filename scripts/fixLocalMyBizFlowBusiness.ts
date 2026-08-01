/**
 * ONE-TIME: cleans up the local-database mix-up from setting up the AN
 * Group / central-api business hierarchy -- "AN Group", "E-Commerce", and
 * "My Biz Flow" all got created as AN-CRM Business documents, but only
 * "My Biz Flow" belongs here (it's AN-CRM's own self-representing tenant
 * that every self-signup vendor gets attached to). "AN Group" and
 * "E-Commerce" are AN Group's / central-api's own top-level concepts and
 * should never have existed as AN-CRM Business records at all.
 *
 * - Deactivates any local Business named "AN Group" or "E-Commerce"
 *   (isActive: false, not deleted -- reversible if this was wrong).
 * - Finds "My Biz Flow" and ensures it's active.
 * - Prints its _id -- set this as AN_CRM_MY_BIZ_FLOW_BUSINESS_ID so
 *   /api/vendors/apply can auto-assign new signups to it.
 *
 * Safe to re-run.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/fixLocalMyBizFlowBusiness.ts
 */
import { connectDB } from "../src/lib/mongodb";
import Business from "../src/models/Business";

const TO_DEACTIVATE = ["AN Group", "E-Commerce"];
const MY_BIZ_FLOW_NAME = "My Biz Flow";

async function main() {
  await connectDB();

  for (const name of TO_DEACTIVATE) {
    const biz = await Business.findOne({ name });
    if (!biz) {
      console.log(`"${name}" -- not found locally, nothing to do.`);
      continue;
    }
    if (biz.isActive === false) {
      console.log(`"${name}" (id ${biz._id}) -- already inactive.`);
      continue;
    }
    biz.isActive = false;
    await biz.save();
    console.log(`"${name}" (id ${biz._id}) -- deactivated.`);
  }

  const myBizFlow = await Business.findOne({ name: MY_BIZ_FLOW_NAME });
  if (!myBizFlow) {
    console.error(`"${MY_BIZ_FLOW_NAME}" not found locally -- create it once (e.g. via /api/businesses/create) before running this script again.`);
    process.exit(1);
  }
  if (myBizFlow.isActive === false) {
    myBizFlow.isActive = true;
    await myBizFlow.save();
    console.log(`"${MY_BIZ_FLOW_NAME}" was inactive -- reactivated.`);
  }

  console.log(`\n"${MY_BIZ_FLOW_NAME}" local Business id: ${myBizFlow._id}`);
  console.log(`Set this as AN_CRM_MY_BIZ_FLOW_BUSINESS_ID in Vercel env vars.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
