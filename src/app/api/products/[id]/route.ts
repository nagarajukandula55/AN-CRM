import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/NativeProduct";
import { logAction } from "@/lib/audit/logAction";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Business";

/**
 * GET / PATCH / DELETE /api/products/[id] — admin single-product management
 * (by Mongo _id, not slug — the [slug] route is the PUBLIC storefront one).
 * Previously there was NO way to edit or delete a NativeProduct at all: only
 * GET (list) and POST (create) existed on /api/products/route.ts. Every
 * write here is scoped to businessId so one business can never edit/delete
 * another's product.
 */

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requireAuth(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  const businessId =
    headersList.get("x-active-business-id") ||
    req.nextUrl.searchParams.get("businessId");
  return { userId, businessId };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId, businessId } = await requireAuth(req);
    const headersList = await headers();
    const isSuperAdmin = headersList.get("x-is-super-admin") === "true";
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    // A Super Admin can open any individual product across any business —
    // everyone else stays scoped to their own active business.
    if (!businessId && !isSuperAdmin) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid product id" }, { status: 400 });
    }

    const query = isSuperAdmin && !businessId
      ? { _id: id }
      : { _id: id, businessId: new mongoose.Types.ObjectId(businessId!) };

    const product = await Product.findOne(query)
      .populate("businessId", "name brandName legalName")
      .lean();

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId, businessId } = await requireAuth(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid product id" }, { status: 400 });
    }

    const body = await req.json();
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
      images,
      isActive,
      metaTitle,
      metaDescription,
      keywords,
      slug,
    } = body;

    const product = await Product.findOne({
      _id: id,
      businessId: new mongoose.Types.ObjectId(businessId),
    });

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    if (typeof name === "string" && name.trim()) product.name = name.trim();
    if (typeof sku === "string") product.sku = sku.trim();
    if (typeof description === "string") product.description = description.trim();
    if (typeof category === "string") product.category = category.trim();
    if (typeof unit === "string") product.unit = unit.trim();
    if (typeof basePrice === "number") product.basePrice = basePrice;
    if (typeof taxRate === "number") product.taxRate = taxRate;
    if (typeof hsn === "string") product.hsn = hsn.trim();
    if (typeof stock === "number") product.stock = stock;
    if (typeof reorderLevel === "number") product.reorderLevel = reorderLevel;
    if (Array.isArray(images)) product.images = images.filter((u: unknown) => typeof u === "string" && u.trim());
    if (typeof isActive === "boolean") product.isActive = isActive;
    if (typeof metaTitle === "string") product.metaTitle = metaTitle.trim();
    if (typeof metaDescription === "string") product.metaDescription = metaDescription.trim();
    if (Array.isArray(keywords)) product.keywords = keywords.filter((k: unknown) => typeof k === "string" && k.trim());

    if (typeof slug === "string" && slug.trim()) {
      let resolvedSlug = generateSlug(slug);
      let slugCandidate = resolvedSlug;
      let attempt = 0;
      while (true) {
        const existing = await Product.findOne({ slug: slugCandidate, _id: { $ne: id } }).lean();
        if (!existing) break;
        attempt += 1;
        slugCandidate = `${resolvedSlug}-${attempt}`;
      }
      product.slug = slugCandidate;
    }

    await product.save();

    logAction({
      action: "UPDATE",
      entity: "Product",
      entityId: product._id?.toString(),
      after: product,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("PATCH /api/products/[id] error:", error);
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId, businessId } = await requireAuth(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!businessId) {
      return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
    }

    await connectDB();
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: "Invalid product id" }, { status: 400 });
    }

    // Soft delete — same convention as isDeleted elsewhere in this model —
    // so historical orders that reference this product's productId still
    // resolve, and the delete is reversible.
    const product = await Product.findOneAndUpdate(
      { _id: id, businessId: new mongoose.Types.ObjectId(businessId) },
      { isDeleted: true, isActive: false },
      { new: true }
    );

    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "Product",
      entityId: product._id?.toString(),
      after: { isDeleted: true },
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
