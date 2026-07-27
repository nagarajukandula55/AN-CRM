import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req) {
  try {
    await connectDB();

    // Optional ?category= filter, added for the Design Studio asset
    // library (design-source / design-component / design-thumbnail) —
    // response stays a raw array (not {success, assets}) since existing
    // callers (AssetLibrary.jsx, admin/assets/page.js) already expect that
    // shape and this must stay backward compatible.
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const query = category ? { category } : {};

    const assets = await Asset.find(query).sort({
      createdAt: -1,
    });

    return NextResponse.json(assets);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
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
      requirePermission(session, buildPermissionCode("assets", "create"));
    } catch (err) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await req.json();

    const asset = await Asset.create(body);

    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
