import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
// Was a locally-declared inline schema registered under the SAME Mongoose
// model name ("NativeProduct") as models/NativeProduct.ts, but on this
// route's own registration call — whichever loaded first silently won for
// the whole app (same bug class already fixed for SalesInvoice.ts). The
// SEO fields this route's schema had (metaTitle/metaDescription/keywords/
// slug) plus isDeleted were merged additively into models/NativeProduct.ts
// — see that file's top comment for the full writeup on the 3 separate
// "native product" things in this codebase (this is NOT the same as
// models/"Native Product.ts", which is a real, separate, still-live system
// against a different MongoDB connection — left untouched).
import Product from "@/models/NativeProduct";
import { logAction } from "@/lib/audit/logAction";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Business";

function generateSku(name: string): string {
  const prefix = name.trim().slice(0, 3).toUpperCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${suffix}`;
}

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: x-user-id header is required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const isSuperAdmin = headersList.get("x-is-super-admin") === "true";
    const wantsAllBusinesses = isSuperAdmin && searchParams.get("allBusinesses") === "true";

    const businessId =
      headersList.get("x-active-business-id") ||
      searchParams.get("businessId");

    if (!businessId && !wantsAllBusinesses) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // A Super Admin needs visibility across every business's products, not
    // just whichever one they currently have active — otherwise the team
    // has no single place to see and control the whole platform's catalog.
    const filter: Record<string, unknown> = wantsAllBusinesses
      ? { isDeleted: { $ne: true } }
      : {
          businessId: new mongoose.Types.ObjectId(businessId!),
          isDeleted: { $ne: true },
        };

    const search = searchParams.get("search");
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    const category = searchParams.get("category");
    if (category && category.trim()) {
      filter.category = category.trim();
    }

    const isActiveParam = searchParams.get("isActive");
    if (isActiveParam !== null && isActiveParam !== "") {
      filter.isActive = isActiveParam === "true";
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      wantsAllBusinesses
        ? Product.find(filter)
            .populate("businessId", "name brandName legalName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
        : Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
      Product.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      products,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: x-user-id header is required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      name,
      sku,
      description,
      category,
      unit,
      basePrice,
      taxRate,
      hsn,
      stock,
      reorderLevel,
      businessId,
      metaTitle,
      metaDescription,
      keywords,
      slug,
      images,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Product name is required" },
        { status: 400 }
      );
    }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Auto-generate SKU if not provided
    let resolvedSku = sku?.trim() || "";
    if (!resolvedSku) {
      resolvedSku = generateSku(name);
    }

    // Auto-generate slug if not provided
    let resolvedSlug = slug?.trim() || "";
    if (!resolvedSlug) {
      resolvedSlug = generateSlug(name);
    }

    // Ensure slug uniqueness by appending a counter if needed
    let slugCandidate = resolvedSlug;
    let slugAttempt = 0;
    while (true) {
      const existing = await Product.findOne({ slug: slugCandidate }).lean();
      if (!existing) break;
      slugAttempt += 1;
      slugCandidate = `${resolvedSlug}-${slugAttempt}`;
    }
    resolvedSlug = slugCandidate;

    const product = await Product.create({
      name: name.trim(),
      sku: resolvedSku,
      description: description?.trim() || undefined,
      category: category?.trim() || undefined,
      businessId: new mongoose.Types.ObjectId(businessId),
      unit: unit?.trim() || undefined,
      basePrice: typeof basePrice === "number" ? basePrice : 0,
      taxRate: typeof taxRate === "number" ? taxRate : 0,
      hsn: hsn?.trim() || undefined,
      stock: typeof stock === "number" ? stock : 0,
      reorderLevel: typeof reorderLevel === "number" ? reorderLevel : 0,
      metaTitle: metaTitle?.trim() || undefined,
      metaDescription: metaDescription?.trim() || undefined,
      keywords: Array.isArray(keywords) ? keywords : [],
      slug: resolvedSlug,
      images: Array.isArray(images) ? images.filter((u: unknown) => typeof u === "string" && u.trim()) : [],
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    logAction({
      action: "CREATE",
      entity: "Product",
      entityId: product._id?.toString(),
      after: product,
      req: request,
      actor: { id: userId, businessId },
    });

    return NextResponse.json(
      { success: true, product },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/products error:", error);

    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 11000
    ) {
      return NextResponse.json(
        { success: false, error: "A product with this SKU or slug already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
