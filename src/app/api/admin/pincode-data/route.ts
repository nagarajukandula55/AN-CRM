import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PincodeEntry from "@/models/PincodeEntry";
import PincodeDatasetMeta from "@/models/PincodeDatasetMeta";
import { convertPincodeCSV } from "@/lib/pincodeImport";
import { logAction } from "@/lib/audit/logAction";

/**
 * GET /api/admin/pincode-data — dataset status for the admin upload page
 * (/admin/pincode-data): how many pincodes are loaded and when it was last
 * updated, so admins can see at a glance whether a refresh is overdue.
 */
export async function GET() {
  try {
    await connectDB();
    const [meta, liveCount] = await Promise.all([
      PincodeDatasetMeta.findOne().sort({ uploadedAt: -1 }).lean(),
      PincodeEntry.countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
      totalPincodes: liveCount,
      lastUpload: meta
        ? {
            sourceFileName: (meta as any).sourceFileName,
            uploadedAt: (meta as any).uploadedAt,
            totalPincodes: (meta as any).totalPincodes,
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load pincode dataset status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/pincode-data — load (a piece of) the pincode dataset from
 * an uploaded CSV (multipart/form-data, field "file"). Expects the same
 * columns as the official India Post "All India Pincode Directory" export
 * (pincode, district, statename, officename, ...) — see
 * src/lib/pincodeImport.ts for the exact parsing/normalization logic,
 * shared with the one-time seed script (scripts/seedPincodes.ts).
 *
 * Stored in MongoDB (not a bundled JSON file) because this app deploys on
 * Vercel, whose filesystem is read-only at runtime — a file-based "admin
 * upload" would silently do nothing in production. See PincodeEntry.ts's
 * comment for the full reasoning.
 *
 * Chunked: the official directory export (~23MB) is well over Vercel's
 * serverless request-body cap (~4.5MB) — a single-shot upload of the real
 * file gets rejected by the platform itself with a plain-text "Request
 * Entity Too Large" response before this handler even runs, which the
 * frontend then fails to JSON-parse. The admin UI (admin/pincode-data/page.tsx)
 * now splits the CSV into line-based chunks client-side and POSTs them
 * sequentially, each one comfortably under the platform limit, tagging the
 * first chunk with append=false (wipes the previous dataset) and every
 * later chunk with append=true (adds to it), with isFinal=true on the last
 * one to write PincodeDatasetMeta once the whole file has landed.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, message: "No file uploaded" }, { status: 400 });
    }
    const append = formData.get("append") === "true";
    const isFinal = formData.get("isFinal") !== "false"; // defaults true for non-chunked callers

    const isCsv =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      return NextResponse.json(
        { success: false, message: "Please upload a .csv file" },
        { status: 400 }
      );
    }

    // Well under Vercel's serverless request-body cap (~4.5MB) — the
    // frontend keeps chunks far smaller than this in normal operation, but
    // this remains a hard backstop against a chunk that somehow slipped
    // through oversized (or a direct API caller bypassing the UI).
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, message: "This chunk is too large (max 4MB per request)" },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const { entries, totalRows, skippedRows } = convertPincodeCSV(csvText);

    if (entries.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No valid pincode rows found — check the file has pincode/district/statename columns matching the official India Post directory format",
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Replace wholesale on the first chunk of a new upload rather than
    // upsert-merge: a refreshed directory export is the new source of
    // truth in full, and stale entries that no longer appear in the new
    // file (e.g. a discontinued pincode) should disappear, not linger from
    // a previous upload. Later chunks of the same upload just add to it.
    if (!append) {
      await PincodeEntry.deleteMany({});
    }

    const CHUNK_SIZE = 2000;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const batch = entries.slice(i, i + CHUNK_SIZE);
      // ordered:false so a duplicate pincode straddling two upload chunks
      // (same pincode's rows split across the client-side line boundary)
      // just gets skipped by the unique index instead of aborting the batch.
      await PincodeEntry.insertMany(batch, { ordered: false }).catch(() => {});
    }

    if (!isFinal) {
      return NextResponse.json({ success: true, totalRows, skippedRows, chunkComplete: true });
    }

    const liveCount = await PincodeEntry.countDocuments();

    await PincodeDatasetMeta.deleteMany({});
    const meta = await PincodeDatasetMeta.create({
      totalPincodes: liveCount,
      sourceFileName: file.name,
      uploadedBy: userId,
      uploadedAt: new Date(),
    });

    logAction({
      action: "CREATE",
      entity: "PincodeDatasetMeta",
      entityId: meta._id?.toString(),
      after: { totalPincodes: liveCount, sourceFileName: file.name },
      req,
    });

    return NextResponse.json({
      success: true,
      totalPincodes: liveCount,
      totalRows,
      skippedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to process pincode file" },
      { status: 500 }
    );
  }
}
