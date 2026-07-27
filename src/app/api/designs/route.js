import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Design from "@/models/Design";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET() {
  try {
    await connectDB();

    const designs = await Design.find().sort({
      createdAt: -1,
    });

    return NextResponse.json(designs);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(req) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session, buildPermissionCode("designs", "create"));
    } catch (err) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const design = await Design.create({
      name: body.name,
      width: body.width,
      height: body.height,
      canvasJson: body.canvasJson || {},
      thumbnail: body.thumbnail || "",
      category: body.category || "label",
      tags: body.tags || [],
      status: body.status || "Draft",
    });

    return NextResponse.json(design);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
