import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agreement from "@/models/Agreement";
import { logAction } from "@/lib/audit/logAction";

export async function POST(req: Request) {
  try {
    await connectDB();
    const userId = req.headers.get("x-user-id");
    const body = await req.json();
    const { agreementId, party, signature } = body; // party: 'company' | 'vendor'

    if (!agreementId || !party || !signature) {
      return NextResponse.json({ success: false, message: "agreementId, party, and signature required" }, { status: 400 });
    }

    // Fetch as plain object to read existing signature state, then update via $set
    const existing = await Agreement.findById(agreementId).lean() as any;
    if (!existing) return NextResponse.json({ success: false, message: "Agreement not found" }, { status: 404 });

    const update: Record<string, unknown> = {};

    if (party === 'company') {
      update.companySignature = signature;
      update.companySignedAt = new Date();
      update.status = existing.vendorSignature ? "SIGNED" : "PENDING_VENDOR";
    } else if (party === 'vendor') {
      update.vendorSignature = signature;
      update.vendorSignedAt = new Date();
      update.status = existing.companySignature ? "SIGNED" : "PENDING_COMPANY";
    } else {
      return NextResponse.json({ success: false, message: "Invalid party" }, { status: 400 });
    }

    const agreement = await Agreement.findByIdAndUpdate(
      agreementId,
      { $set: update },
      { new: true }
    ).lean();

    logAction({
      action: "SIGN",
      entity: "Agreement",
      entityId: agreementId,
      after: update,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, agreement });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
