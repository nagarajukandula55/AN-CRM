/**
 * ONE-TIME SEED: loads the initial India pincode dataset into MongoDB
 * (PincodeEntry collection) from a CSV file matching the official India
 * Post "All India Pincode Directory" export format.
 *
 * This is only needed ONCE to bootstrap the dataset — after that, admins
 * can refresh it any time via the UI at /admin/pincode-data (which hits
 * POST /api/admin/pincode-data), without needing to re-run this script.
 *
 * Usage:
 *   npx tsx scripts/seedPincodes.ts path/to/pincode-directory.csv
 *
 * (Requires MONGODB_URI to be set — reads from .env.local automatically
 * if using `npx dotenv -e .env.local -- npx tsx scripts/seedPincodes.ts ...`,
 * or export MONGODB_URI in your shell first.)
 */
import fs from "fs";
import path from "path";
import { connectDB } from "../src/core/db/mongodb";
import PincodeEntry from "../src/models/PincodeEntry";
import PincodeDatasetMeta from "../src/models/PincodeDatasetMeta";
import { convertPincodeCSV } from "../src/lib/pincodeImport";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/seedPincodes.ts <path-to-csv>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Reading ${resolvedPath}...`);
  const csvText = fs.readFileSync(resolvedPath, "utf-8");

  console.log("Parsing and normalizing...");
  const { entries, totalRows, skippedRows } = convertPincodeCSV(csvText);
  console.log(
    `Parsed ${totalRows} rows -> ${entries.length} unique pincodes (${skippedRows} rows skipped as invalid)`
  );

  await connectDB();
  console.log("Connected to MongoDB.");

  console.log("Replacing PincodeEntry collection...");
  await PincodeEntry.deleteMany({});

  // Bulk insert in chunks to avoid one giant insertMany call.
  const CHUNK_SIZE = 2000;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    await PincodeEntry.insertMany(chunk, { ordered: false });
    console.log(`  inserted ${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length}`);
  }

  await PincodeDatasetMeta.deleteMany({});
  await PincodeDatasetMeta.create({
    totalPincodes: entries.length,
    sourceFileName: path.basename(resolvedPath),
    uploadedAt: new Date(),
  });

  console.log(`Done. ${entries.length} pincodes loaded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
