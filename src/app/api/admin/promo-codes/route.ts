import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PromoCode from "@/models/PromoCode";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

/**
 * GET  /api/admin/promo-codes — every company-issued promo code.
 * POST /api/admin/promo-codes — create a new one.
 * Super Admin only, same as the referral system's own admin surfaces.
 */
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    await connectDB();
    const codes = await PromoCode.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, codes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    const body = await req.json();
    const { code, description, discountPct, maxRedemptions, expiresAt } = body as {
      code?: string;
      description?: string;
      discountPct?: number;
      maxRedemptions?: number;
      expiresAt?: string;
    };
    if (!code?.trim() || !discountPct || discountPct <= 0 || discountPct > 100) {
      return NextResponse.json({ success: false, message: "A code and a discountPct between 1-100 are required" }, { status: 400 });
    }

    await connectDB();
    const created = await PromoCode.create({
      code: code.trim().toUpperCase(),
      description: description?.trim() || undefined,
      discountPct,
      maxRedemptions: maxRedemptions && maxRedemptions > 0 ? maxRedemptions : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: session.user?.id,
    });

    return NextResponse.json({ success: true, code: created });
  } catch (error: unknown) {
    // Duplicate code -- surface a clear message instead of a raw Mongo error.
    if ((error as any)?.code === 11000) {
      return NextResponse.json({ success: false, message: "That code already exists" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
