import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getInvoiceById } from "@/services/sales.service";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

export async function GET(_: Request, { params }: any) {
  // SECURITY: had no auth check at all -- any caller could fetch any
  // invoice's full detail (customer PII, line items, amounts) by id.
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const data = await getInvoiceById(params.id);
  if (!data) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  if (!session.isSuperAdmin) {
    const ownBusinessId = await resolveAuthorizedBusinessId(
      session.user.id,
      String((data as any).businessId || ""),
      false,
      session.business?.businessId || null
    );
    if (!ownBusinessId || String((data as any).businessId) !== String(ownBusinessId)) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json({
    success: true,
    data,
  });
}
