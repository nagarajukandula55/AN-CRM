import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
// Was a locally-declared inline SalesInvoice schema (near-identical to, but
// missing invoiceType/vendorId/sourceOrderId from, models/SalesInvoice.ts).
// Mongoose registers models globally by name, so whichever of the 4 route
// files defining "SalesInvoice" happened to load first silently won for
// the whole app — the other 3 definitions became dead weight while still
// creating the false impression each route controlled its own schema. Now
// imports the single canonical model, matching what models/SalesInvoice.ts's
// own top comment already (incorrectly, until now) claimed was already true.
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

/**
 * SECURITY: every handler below used to have NO ownership check at all --
 * GET didn't even require a session, and PUT/DELETE only checked that
 * *a* user was logged in, never that the invoice being read/edited/
 * deleted actually belonged to that user's business/vendor. Any
 * authenticated caller (or an unauthenticated one, for GET) could view,
 * edit, or delete ANY invoice on the platform by guessing/enumerating its
 * id. Fixed to resolve the caller's authorized {businessId, vendorId}
 * scope (same helper every other vendor-scoped route in this app uses)
 * and verify the invoice matches before doing anything with it.
 */
async function resolveScopeOrNull(userId: string | null) {
  if (!userId) return null;
  const session = await getEnrichedSession();
  const h = await headers();
  return resolveAuthorizedVendorScope(
    userId,
    h.get("x-active-business-id"),
    !!session?.isSuperAdmin,
    session?.business?.businessId || null
  );
}

function invoiceInScope(invoice: any, scope: { businessId: string; vendorId: string | null } | null): boolean {
  if (!scope) return false;
  if (String(invoice.businessId || "") !== String(scope.businessId)) return false;
  if (scope.vendorId && String(invoice.vendorId || "") !== String(scope.vendorId)) return false;
  return true;
}

/* ── GET single invoice ──────────────────────────────────── */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await connectDB();

    const invoice = await SalesInvoice.findById(id).lean();
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const scope = await resolveScopeOrNull(userId);
    if (!invoiceInScope(invoice, scope)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ── PUT update invoice ──────────────────────────────────── */
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await connectDB();

    const existing = await SalesInvoice.findById(id).select("businessId vendorId").lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const scope = await resolveScopeOrNull(userId);
    if (!invoiceInScope(existing, scope)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();

    // Recalculate if items sent
    if (body.items) {
      let subtotal = 0, taxTotal = 0;
      body.items = body.items.map((item: any) => {
        const lineTotal = (item.quantity || 1) * (item.unitPrice || 0);
        const tax = lineTotal * ((item.taxRate || 0) / 100);
        subtotal += lineTotal;
        taxTotal += tax;
        return { ...item, taxAmount: tax, assessableValue: lineTotal, total: lineTotal + tax };
      });
      body.subtotal = subtotal;
      body.taxTotal = taxTotal;
      body.grandTotal = subtotal + taxTotal - (body.discountAmount || 0);
    }

    const invoice = await SalesInvoice.findByIdAndUpdate(id, { $set: body }, { new: true }).lean();

    logAction({
      action: "UPDATE",
      entity: "SalesInvoice",
      entityId: id,
      after: invoice,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* ── DELETE invoice ──────────────────────────────────────── */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    await connectDB();

    const existing = await SalesInvoice.findById(id).select("businessId vendorId").lean();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const scope = await resolveScopeOrNull(userId);
    if (!invoiceInScope(existing, scope)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await SalesInvoice.findByIdAndDelete(id);

    logAction({
      action: "DELETE",
      entity: "SalesInvoice",
      entityId: id,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
