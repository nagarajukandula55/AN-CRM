import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import BOM from "@/models/BOM";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(
  req: Request,
  { params }: any
) {
  try {
    await connectDB();

    const bom =
      await BOM.findById(
        params.id
      )
        .populate(
          "productVariantId"
        )
        .populate(
          "items.materialId"
        );

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

export async function PUT(
  req: Request,
  { params }: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("bom", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const bom =
      await BOM.findByIdAndUpdate(
        params.id,
        body,
        {
          new: true,
        }
      );

    logAction({
      action: "UPDATE",
      entity: "BOM",
      entityId: params.id,
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

export async function DELETE(
  req: Request,
  { params }: any
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("bom", "delete"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    await BOM.findByIdAndDelete(
      params.id
    );

    logAction({
      action: "DELETE",
      entity: "BOM",
      entityId: params.id,
      req,
    });

    return NextResponse.json({
      success: true,
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
