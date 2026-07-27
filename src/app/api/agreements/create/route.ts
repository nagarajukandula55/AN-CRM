import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agreement from "@/models/Agreement";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";

/**
 * REMOVED: a local getNextNumber() used to live here — a TENTH
 * previously-undiscovered duplicate number generator, and the least
 * business-scoped of any of them: it found the single globally-last
 * Agreement across EVERY business on the platform (`findOne({}, ...)` —
 * no businessId filter whatsoever), sorted by `createdAt` rather than by
 * `agreementNumber` itself (so "last created" and "highest numbered"
 * could disagree if agreements were ever created out of order or backdated),
 * and derived the next number by string-splitting on "-" — fragile if the
 * prefix format ever changed. Replaced with the canonical
 * core/numbering/numberingService.ts, scoped per-business via the new
 * AGREEMENT document type (see core/numbering/types.ts).
 */

export async function POST(req: Request) {
  try {
    await connectDB();
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Auth required" }, { status: 401 });

    const body = await req.json();

    if (!body?.businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    const { value: number } = await generateDocumentNumber(body.businessId, "AGREEMENT");

    const agreement = await Agreement.create({
      ...body,
      agreementNumber: number,
      createdBy: userId,
      status: "DRAFT",
    });

    logAction({
      action: "CREATE",
      entity: "Agreement",
      entityId: agreement?._id?.toString(),
      after: agreement,
      req,
      actor: { id: userId, businessId: body.businessId },
    });

    return NextResponse.json({ success: true, agreement });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
