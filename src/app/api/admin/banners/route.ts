import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import Banner from "@/models/Banner";
import { logAction } from "@/lib/audit/logAction";
import { requirePermission } from "@/lib/auth/permissions";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// GET /api/admin/banners?businessId=... — admin list of every banner
// (active or not) for a business, sorted for the reorder UI.
export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("banners", "view"));

    const { searchParams } = req.nextUrl;
    const businessId = searchParams.get("businessId");
    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "Valid businessId is required" }, { status: 400 });
    }

    await connectDB();
    const banners = await Banner.find({ businessId }).sort({ sortOrder: 1, createdAt: 1 }).lean();

    return NextResponse.json({ success: true, banners });
  } catch (error: any) {
    if (error?.code === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/admin/banners — create a banner record. The image itself is
// uploaded separately via POST /api/assets/upload (Cloudinary) first; this
// route just persists the resulting URL + metadata.
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("banners", "create"));

    const h = await headers();
    const userId = h.get("x-user-id");

    const body = await req.json();
    const { businessId, imageUrl, heading, subheading, ctaText, ctaLink } = body;

    if (!businessId || !Types.ObjectId.isValid(businessId)) {
      return NextResponse.json({ success: false, error: "Valid businessId is required" }, { status: 400 });
    }
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ success: false, error: "imageUrl is required" }, { status: 400 });
    }

    await connectDB();

    // New banners default to the end of the slideshow order.
    const count = await Banner.countDocuments({ businessId });

    const banner = await Banner.create({
      businessId,
      imageUrl: imageUrl.trim(),
      heading: heading?.trim() || undefined,
      subheading: subheading?.trim() || undefined,
      ctaText: ctaText?.trim() || "SHOP NOW",
      ctaLink: ctaLink?.trim() || "/products",
      sortOrder: count,
      isActive: true,
    });

    logAction({
      action: "CREATE",
      entity: "Banner",
      entityId: banner._id?.toString(),
      after: banner.toObject(),
      req,
      actor: { id: userId || undefined, businessId },
    });

    return NextResponse.json({ success: true, banner }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
