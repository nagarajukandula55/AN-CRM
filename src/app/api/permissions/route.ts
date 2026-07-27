import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import Permission from "@/models/Permission";

/* =========================================================
 * GET PERMISSIONS
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const module = searchParams.get("module") || undefined;
    const group = searchParams.get("group") || undefined;

    const query: any = {
      isDeleted: false,
      status: "ACTIVE",
    };

    if (module) query.module = module;
    if (group) query.group = group;

    const permissions = await Permission.find(query).sort({
      module: 1,
      group: 1,
      code: 1,
    });

    /**
     * Group permissions for UI (Role matrix friendly)
     */
    const grouped: Record<string, any> = {};

    for (const perm of permissions) {
      const key = `${perm.module}:${perm.group}`;

      if (!grouped[key]) {
        grouped[key] = {
          module: perm.module,
          group: perm.group,
          permissions: [],
        };
      }

      grouped[key].permissions.push({
        id: perm._id,
        name: perm.name,
        code: perm.code,
      });
    }

    return NextResponse.json({
      success: true,
      data: Object.values(grouped),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
