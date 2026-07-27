/**
 * HR Payroll API — backs src/app/admin/hr/payroll/page.tsx.
 * GET /api/hr/payroll?businessId=&month=&year=
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Payroll from "@/models/Payroll";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("hr_payroll", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    if (!businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const query: Record<string, unknown> = { businessId };
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const payrolls = await Payroll.find(query).sort({ employeeName: 1 }).lean();
    return NextResponse.json({ success: true, payrolls });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load payroll" },
      { status: 500 }
    );
  }
}
