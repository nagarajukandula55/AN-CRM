import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VendorPlan from "@/models/VendorPlan";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// PUT /api/admin/vendor-plans/:id — edit an existing plan's name/modules/
// price/validity/active-state. Existing VendorSubscriptions that already
// bought this plan keep their own snapshotted modules/rate/planName
// (see VendorSubscription.ts) -- editing a plan here only changes what
// FUTURE purchases of it look like.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const { id } = await params;
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
    const plan = await VendorPlan.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description?.trim() || "",
        moduleKeys,
        price,
        validityDays: validityDays && validityDays > 0 ? validityDays : 30,
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
      },
      { new: true }
    );
    if (!plan) return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/vendor-plans/:id — hard delete. Only meant for a plan
// nobody has ever purchased (VendorSubscription snapshots its own
// modules/rate/planName, so an existing subscriber is unaffected either
// way) -- admins should prefer deactivating (isActive: false via PUT) over
// deleting once a plan has real subscribers, so it stops appearing to new
// vendors without disturbing this plan's own invoice history.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const { id } = await params;
    await connectDB();
    const plan = await VendorPlan.findByIdAndDelete(id);
    if (!plan) return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
