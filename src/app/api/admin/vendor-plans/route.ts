import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorPlan from "@/models/VendorPlan";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// GET /api/admin/vendor-plans — full catalog (active + inactive) for the
// admin editor. POST creates a new plan.
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    await connectDB();
    const plans = await VendorPlan.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return NextResponse.json({ success: true, plans });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const body = await req.json();
    const { name, description, moduleKeys, price, validityDays, isActive, sortOrder } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: "Plan name is required" }, { status: 400 });
    }
    if (!Array.isArray(moduleKeys) || moduleKeys.length === 0) {
      return NextResponse.json({ success: false, message: "Select at least one module" }, { status: 400 });
    }
    if (typeof price !== "number" || price <= 0) {
      return NextResponse.json({ success: false, message: "Price must be greater than 0" }, { status: 400 });
    }

    await connectDB();
    const plan = await VendorPlan.create({
      name: name.trim(),
      description: description?.trim() || "",
      moduleKeys,
      price,
      validityDays: validityDays && validityDays > 0 ? validityDays : 30,
      isActive: isActive !== false,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, plan }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
