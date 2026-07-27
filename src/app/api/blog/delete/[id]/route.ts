import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Blog from "@/models/Blog";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("blog", "delete"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const { id } = await context.params;

    await Blog.findByIdAndDelete(id);

    logAction({
      action: "DELETE",
      entity: "Blog",
      entityId: id,
      req: request,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("BLOG DELETE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}
