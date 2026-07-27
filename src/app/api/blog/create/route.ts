import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Blog from "@/models/Blog";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(request: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("blog", "create"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const body = await request.json();

    if (!body?.title) {
      return NextResponse.json(
        {
          success: false,
          message: "Title is required",
        },
        {
          status: 400,
        }
      );
    }

    const slug = body.title
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const blog = await Blog.create({
      title: body.title,
      slug,
      excerpt: body.excerpt || "",
      content: body.content || "",
      image: body.image || "",
      category: body.category || "General",
    });

    logAction({
      action: "CREATE",
      entity: "Blog",
      entityId: blog._id.toString(),
      after: blog,
      req: request,
    });

    return NextResponse.json({
      success: true,
      blog,
    });
  } catch (error: any) {
    console.error("BLOG CREATE ERROR:", error);

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
