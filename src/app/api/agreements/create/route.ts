import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agreement from "@/models/Agreement";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

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
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, message: "Auth required" }, { status: 401 });
    const userId = session.user.id;

    const body = await req.json();

    if (!body?.businessId) {
      return NextResponse.json({ success: false, message: "businessId is required" }, { status: 400 });
    }

    // Same rule as api/agreements/route.ts's POST: an agreement can only be
    // issued for the business the caller is actually operating in, never
    // an arbitrary client-supplied businessId. Super admins may issue for
    // any business.
    if (!session.isSuperAdmin && body.businessId !== session.business?.businessId) {
      return NextResponse.json(
        { success: false, message: "You do not have access to issue an agreement for this business." },
        { status: 403 }
      );
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
