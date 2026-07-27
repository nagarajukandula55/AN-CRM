/**
 * POST /api/admin/seed-catalog?businessId=... -- runs the curated Indian-
 * market catalog seed (src/core/catalog/seedCatalogData.ts) for just this
 * one business, from a browser button ("Seed Standard Catalog" on the
 * admin Brands page) instead of the CLI script
 * (scripts/seedDeviceCategories.ts), which needs a local .env.local /
 * shell access an admin working entirely from the browser doesn't have.
 * Runs against the server's own already-configured DB connection, so no
 * credentials are needed on the client side at all.
 *
 * Idempotent / insert-only, same guarantees as the CLI script -- safe to
 * click more than once, or after adding more categories to
 * seedCatalogData.ts later.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Brand from "@/models/Brand";
import { seedForBusiness } from "@/core/catalog/seedCatalogData";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("brands", "create"));
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "Valid businessId is required" }, { status: 400 });
    }

    await connectDB();

    // Same reasoning as the CLI script: Brand's unique index moved from
    // {businessId, name} to {businessId, category, name}, and autoIndex
    // only adds new indexes, never drops the stale one -- reconcile before
    // seeding so a legitimate second "Apple"/"Samsung" row under a
    // different category isn't rejected by the old constraint.
    await Brand.syncIndexes();

    const summary = await seedForBusiness(businessId);

    return NextResponse.json({ success: true, summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
