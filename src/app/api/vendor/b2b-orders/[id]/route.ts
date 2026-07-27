import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import B2BOrder from "@/models/B2BOrder";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

// PATCH /api/vendor/b2b-orders/:id — vendor moves an incoming B2B order
// through CONFIRMED -> FULFILLED, or CANCELLED.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const ctx = await resolveVendorContext(userId);
    if (!ctx) return NextResponse.json({ success: false, message: "Vendor profile not found" }, { status: 404 });
    const vendor = ctx.vendor as any;

    const order = await B2BOrder.findOne({ _id: id, vendorId: vendor._id });
    if (!order) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });

    const body = await req.json();
    if (!["PENDING", "CONFIRMED", "FULFILLED", "CANCELLED"].includes(body.status)) {
      return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    }
    order.status = body.status;
    await order.save();

    return NextResponse.json({ success: true, data: order });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
