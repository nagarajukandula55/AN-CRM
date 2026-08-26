import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { notify } from "@/lib/notify";
import { round2 } from "@/core/gst/money";
import { generateDocumentNumber, generateScopedDocumentNumber } from "@/core/numbering/numberingService";
// Was a locally-declared inline "GST-compliant" SalesInvoice schema —
// its GST-specific fields (supplyType, placeOfSupply, per-item hsnCode/
// cgstRate/cgstAmount/sgstRate/sgstAmount/igstRate/igstAmount, and
// invoice-level cgstTotal/sgstTotal/igstTotal) did NOT exist on
// models/SalesInvoice.ts's original schema, so this couldn't be safely
// switched over without first extending the canonical model — done, see
// models/SalesInvoice.ts's top comment for the full writeup. This route
// and app/api/sales/invoices/[id]/route.ts both now share the one real
// model instead of each registering "SalesInvoice" under a different
// shape (whichever loaded first used to silently win for the whole app).
import SalesInvoice from "@/models/SalesInvoice";
import { logAction } from "@/lib/audit/logAction";
import { captureCustomer } from "@/services/customer.service";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { resolveAuthorizedBusinessId, resolveAuthorizedVendorScope } from "@/lib/auth/resolveAuthorizedBusinessId";

/* ── Invoice number generator ─────────────────────────────────────── */
/**
 * A NINTH previously-undiscovered duplicate number generator lived here —
 * find-highest-then-increment via regex + string sort (same race-condition
 * and lexicographic-sort-past-9999 issues as the stock-transfer and
 * production-order generators fixed elsewhere in this consolidation pass;
 * see core/numbering/types.ts's top comment for the full list), hardcoded
 * "INV/" prefix ignoring any admin config. It also used to operate on a
 * SEPARATE self-contained inline SalesInvoice schema, since resolved by
 * extending and switching to models/SalesInvoice.ts (see that file's top
 * comment and the import above) — no longer a live concern for this route.
 *
 * Fixed to use the canonical engine when a real businessId is available.
 * This route's numbering key can ALSO be a bare userId (when no business
 * context exists — see the `effectiveBizId || userId` fallback below,
 * unchanged from the original behavior) — the canonical engine requires an
 * actual businessId to scope DocumentNumberConfig/NumberSequence against,
 * so that no-business edge case keeps the OLD per-key regex/sort logic
 * rather than being forced through a per-business config that wouldn't
 * apply to it. This is the one call site in this consolidation pass that
 * couldn't be fully unified for that reason — flagged here and in
 * PROGRESS.md rather than silently forcing it through.
 */
async function nextInvoiceNumber(key: string, businessId: string | undefined, isNonGst: boolean, vendorId?: string | null): Promise<string> {
  if (businessId) {
    // GST and Non-GST invoices get their own separate running series
    // (INV vs BILL) -- same distinction the CRM job-sheet close route
    // already makes, see api/crm/jobsheets/[id]/close/route.ts's own
    // comment. Reported live: this route ignored invoiceType entirely
    // and always used "INVOICE", so a Non-GST invoice landed on the same
    // series/sequence as GST ones.
    //
    // SECURITY/CORRECTNESS: was always scoped by plain businessId
    // (generateDocumentNumber), with a `{ vendorId: "" }` context that
    // does NOTHING for the actual counter scope (context only affects
    // number FORMAT, not which counter document gets incremented -- see
    // generateNumberInScope). Every vendor sharing this platform's one
    // Business therefore shared ONE invoice-number sequence, and worse,
    // this route never set vendorId on the created invoice at all (see
    // the create() call below), making every invoice created here
    // invisible to that vendor's own invoice list/statement (both filter
    // by vendorId). Reported live ("every vendors their own bill and
    // invoices sequence and their own system should be there, this
    // should not miss in any way"). Scoped by the vendor's own id now,
    // same pattern as api/crm/jobsheets/[id]/close/route.ts and BOM/
    // material numbering -- falls back to plain businessId scoping only
    // for a business-level caller with no vendor context (Brand/Sales
    // staff creating an invoice not attributed to any one vendor).
    const scopeKey = vendorId || businessId;
    const { value } = await generateScopedDocumentNumber(scopeKey, isNonGst ? "NON_GST_INVOICE" : "INVOICE", businessId);
    return value;
  }

  const yr  = new Date().getFullYear()
  const mo  = String(new Date().getMonth() + 1).padStart(2, "0")
  const fy  = mo >= "04" ? `${yr}-${String(yr + 1).slice(2)}` : `${yr - 1}-${String(yr).slice(2)}`
  const prefix = isNonGst ? `BILL/${fy}/` : `INV/${fy}/`

  const last = await SalesInvoice.findOne(
    { $or: [{ businessId: key }, { createdBy: key }], invoiceNumber: { $regex: `^${prefix}` } },
    { invoiceNumber: 1 }
  ).sort({ invoiceNumber: -1 }).lean() as any

  const seq = last
    ? parseInt(last.invoiceNumber.replace(prefix, "")) + 1
    : 1

  return `${prefix}${String(seq).padStart(4, "0")}`
}

/* ── GET /api/sales/invoices ──────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const h        = await headers()
    const userId   = h.get("x-user-id")
    const requestedBizId = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId")

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    // SECURITY: an unset x-active-business-id header (stale JWT) used to
    // fall through to trusting a raw ?businessId= from the client with no
    // ownership check -- see lib/auth/resolveAuthorizedBusinessId.ts.
    //
    // SECURITY: this route used to scope only by businessId, which -- on a
    // marketplace business hosting multiple vendors (the common case, see
    // resolveAuthorizedVendorScope's own comment) -- returned EVERY
    // vendor's invoices to EVERY other vendor sharing that business. Now
    // additionally scopes by vendorId when the caller resolves to one
    // (business-level staff/super-admin still see all vendors' invoices,
    // same as before).
    const session = await getEnrichedSession()
    const scope = await resolveAuthorizedVendorScope(
      userId,
      requestedBizId,
      !!session?.isSuperAdmin,
      session?.business?.businessId || null
    )
    const bizId = scope?.businessId || null

    const filter: any = {}
    if (bizId && mongoose.Types.ObjectId.isValid(bizId)) {
      filter.businessId = new mongoose.Types.ObjectId(bizId)
      if (scope?.vendorId && mongoose.Types.ObjectId.isValid(scope.vendorId)) {
        filter.vendorId = new mongoose.Types.ObjectId(scope.vendorId)
      }
    } else {
      filter.createdBy = new mongoose.Types.ObjectId(userId)
    }

    const status = req.nextUrl.searchParams.get("status")
    if (status && status !== "ALL") filter.status = status

    const from = req.nextUrl.searchParams.get("from")
    const to   = req.nextUrl.searchParams.get("to")
    if (from || to) {
      filter.issueDate = {}
      if (from) filter.issueDate.$gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        filter.issueDate.$lte = toDate
      }
    }

    const q = req.nextUrl.searchParams.get("search")
    if (q) filter.$or = [
      { invoiceNumber:     { $regex: q, $options: "i" } },
      { "customer.name":   { $regex: q, $options: "i" } },
    ]

    const page  = Math.max(1, parseInt(req.nextUrl.searchParams.get("page")  || "1"))
    const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "50"))

    const [invoices, total] = await Promise.all([
      SalesInvoice.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SalesInvoice.countDocuments(filter),
    ])

    return NextResponse.json({ success: true, invoices, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/* ── POST /api/sales/invoices ─────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const h      = await headers()
    const userId = h.get("x-user-id")
    const bizId  = h.get("x-active-business-id")

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const {
      customer,
      items       = [],
      notes,
      terms,
      showPaymentQr = true,
      showBankDetails = true,
      showSignature = true,
      dueDate,
      discountAmount = 0,
      status         = "DRAFT",
      supplyType     = "INTRASTATE",
      placeOfSupply,
      invoiceType    = "GST",
    } = body
    const isNonGst = invoiceType === "NON_GST"

    if (!customer?.name) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 })
    }

    await connectDB()

    // SECURITY: body.businessId used to win outright over the trusted
    // header -- see resolveAuthorizedBusinessId's own comment.
    //
    // SECURITY: was resolveAuthorizedBusinessId (business-only) -- meant
    // this route never learned the caller's own vendorId at all, so every
    // invoice it created had vendorId unset. Since GET (this route's own
    // list) and the Financial Statement both filter by vendorId when the
    // caller resolves to one, an invoice created here was invisible to
    // the very vendor who created it. Switched to
    // resolveAuthorizedVendorScope, same fix pattern already applied to
    // GET above.
    const session = await getEnrichedSession()
    const scope = await resolveAuthorizedVendorScope(
      userId,
      body.businessId || bizId,
      !!session?.isSuperAdmin,
      session?.business?.businessId || null
    )
    const effectiveBizId = scope?.businessId || null
    const effectiveVendorId = scope?.vendorId || null

    /* Compute GST-split per item */
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0

    const processedItems = items.map((item: any) => {
      // A Non-GST invoice carries zero tax on every line, full stop --
      // enforced here server-side rather than trusted from the client.
      // Reported live: a Non-GST invoice still came out with real tax
      // applied, because nothing zeroed item.taxRate/taxPct for this case
      // -- the frontend's own default (new line items on a fresh
      // invoice) happened to start at 18% before the user ever touched
      // the GST/Non-GST toggle, and that value was never cleared.
      const rawTaxRate = isNonGst ? 0 : (item.taxRate || item.taxPct || 0)
      const lineAmt   = round2((item.quantity || item.qty || 1) * (item.unitPrice || item.price || 0))
      const totalGST  = round2(lineAmt * (rawTaxRate / 100))

      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0
      let igstRate = 0, igstAmount = 0

      if (supplyType === "INTERSTATE") {
        igstRate   = rawTaxRate
        igstAmount = totalGST
        igstTotal += igstAmount
      } else {
        cgstRate   = rawTaxRate / 2
        sgstRate   = cgstRate
        cgstAmount = round2(totalGST / 2)
        sgstAmount = round2(totalGST / 2)
        cgstTotal += cgstAmount
        sgstTotal += sgstAmount
      }

      subtotal += lineAmt

      return {
        description: item.description || "",
        hsnCode:     item.hsnCode     || "",
        quantity:    item.quantity    || item.qty || 1,
        unit:        item.unit        || "Nos",
        unitPrice:   item.unitPrice   || item.price || 0,
        taxRate:     rawTaxRate,
        taxAmount:   totalGST,
        cgstRate, cgstAmount,
        sgstRate, sgstAmount,
        igstRate, igstAmount,
        total: round2(lineAmt + totalGST),
      }
    })

    subtotal = round2(subtotal)
    cgstTotal = round2(cgstTotal)
    sgstTotal = round2(sgstTotal)
    igstTotal = round2(igstTotal)
    const taxTotal   = round2(cgstTotal + sgstTotal + igstTotal)
    const grandTotal = round2(subtotal + taxTotal - discountAmount)

    const invoiceNumber = await nextInvoiceNumber(effectiveBizId || userId, effectiveBizId || undefined, isNonGst, effectiveVendorId)

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId: effectiveBizId ? new mongoose.Types.ObjectId(effectiveBizId) : undefined,
      vendorId: effectiveVendorId ? new mongoose.Types.ObjectId(effectiveVendorId) : undefined,
      createdBy:  new mongoose.Types.ObjectId(userId),
      customer,
      supplyType,
      placeOfSupply,
      items:          processedItems,
      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      discountAmount,
      grandTotal,
      notes,
      terms,
      showPaymentQr,
      showBankDetails,
      showSignature,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status,
    })

    logAction({
      action: "CREATE",
      entity: "SalesInvoice",
      entityId: invoice._id?.toString(),
      after: invoice,
      req,
      actor: { id: userId, businessId: effectiveBizId },
    });

    captureCustomer({
      businessId: effectiveBizId,
      vendorId: effectiveVendorId,
      name: customer?.name,
      phone: customer?.phone,
      email: customer?.email,
      address: customer?.address,
      sourceModule: "SALES_INVOICE",
    });

    notify({
      event:   "NEW_INVOICE",
      message: `🧾 New invoice ${invoice.invoiceNumber}\nCustomer: ${customer.name}\nAmount: ₹${grandTotal.toLocaleString("en-IN")}\nGST: ₹${taxTotal.toLocaleString("en-IN")}`,
    }).catch(() => {})

    return NextResponse.json({ success: true, invoice }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
