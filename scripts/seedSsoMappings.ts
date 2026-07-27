import { connectDB } from "../src/core/db/mongodb";
import SsoSourceMapping from "../src/models/SsoSourceMapping";

async function main() {
  await connectDB();
  await SsoSourceMapping.updateOne(
    { urlPattern: "shopnative.in" },
    { $setOnInsert: { urlPattern: "shopnative.in", sourceLabel: "shopnative", defaultRoleCode: "CUSTOMER_SHOPNATIVE", isActive: true } },
    { upsert: true }
  );
  await SsoSourceMapping.updateOne(
    { urlPattern: "angroup.in" },
    { $setOnInsert: { urlPattern: "angroup.in", sourceLabel: "angroup", defaultRoleCode: "CUSTOMER_ANGROUP", isActive: true } },
    { upsert: true }
  );
  console.log("done");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
