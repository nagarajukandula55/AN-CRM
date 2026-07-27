import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ProductVariant from "@/models/ProductVariant";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/Product";

export async function GET() {
  await connectDB();

  const data =
    await ProductVariant.find()
      .populate("productId")
      .sort({ variantName: 1 });

  return NextResponse.json({
    success: true,
    data,
  });
}

export async function POST(req: Request) {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  try {
    requirePermission(session as any, buildPermissionCode("products", "create"));
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: err.code === "FORBIDDEN" ? 403 : 401 }
    );
  }

  await connectDB();

  const body = await req.json();

  const variant =
    await ProductVariant.create(body);

  logAction({
    action: "CREATE",
    entity: "ProductVariant",
    entityId: variant._id?.toString(),
    after: variant,
    req,
  });

  return NextResponse.json({
    success: true,
    data: variant,
  });
}
