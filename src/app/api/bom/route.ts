import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import BOM from "@/models/BOM";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET() {
  try {
    await connectDB();

    const data = await BOM.find()
      .populate({
        path: "productVariantId",
        select:
          "variantCode variantName sku",
      })
      .sort({
        createdAt: -1,
      });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  req: Request
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("bom", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const bom =
      await BOM.create(body);

    logAction({
      action: "CREATE",
      entity: "BOM",
      entityId: bom?._id?.toString(),
      after: body,
      req,
    });

    return NextResponse.json({
      success: true,
      data: bom,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
