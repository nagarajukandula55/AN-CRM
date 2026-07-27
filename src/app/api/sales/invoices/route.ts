import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { notify } from "@/lib/notify";
import { generateDocumentNumber } from "@/core/numbering/numberingService";
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
async function nextInvoiceNumber(key: string, businessId?: string): Promise<string> {
  if (businessId) {
    const { value } = await generateDocumentNumber(businessId, "INVOICE", { vendorId: "" });
    return value;
  }

  const yr  = new Date().getFullYear()
  const mo  = String(new Date().getMonth() + 1).padStart(2, "0")
  const fy  = mo >= "04" ? `${yr}-${String(yr + 1).slice(2)}` : `${yr - 1}-${String(yr).slice(2)}`
  const prefix = `INV/${fy}/`

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
    const bizId    = h.get("x-active-business-id") || req.nextUrl.searchParams.get("businessId")

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    const filter: any = {}
    if (bizId && mongoose.Types.ObjectId.isValid(bizId)) {
      filter.businessId = new mongoose.Types.ObjectId(bizId)
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
      dueDate,
      discountAmount = 0,
      status         = "DRAFT",
      supplyType     = "INTRASTATE",
      placeOfSupply,
    } = body

    if (!customer?.name) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 })
    }

    await connectDB()

    const effectiveBizId = body.businessId || bizId

    /* Compute GST-split per item */
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0

    const processedItems = items.map((item: any) => {
      const lineAmt   = (item.quantity || item.qty || 1) * (item.unitPrice || item.price || 0)
      const totalGST  = lineAmt * ((item.taxRate || item.taxPct || 0) / 100)

      let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0
      let igstRate = 0, igstAmount = 0

      if (supplyType === "INTERSTATE") {
        igstRate   = item.taxRate || item.taxPct || 0
        igstAmount = totalGST
        igstTotal += igstAmount
      } else {
        cgstRate   = (item.taxRate || item.taxPct || 0) / 2
        sgstRate   = cgstRate
        cgstAmount = totalGST / 2
        sgstAmount = totalGST / 2
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
        taxRate:     item.taxRate     || item.taxPct || 0,
        taxAmount:   totalGST,
        cgstRate, cgstAmount,
        sgstRate, sgstAmount,
        igstRate, igstAmount,
        total: lineAmt + totalGST,
      }
    })

    const taxTotal   = cgstTotal + sgstTotal + igstTotal
    const grandTotal = subtotal + taxTotal - discountAmount

    const invoiceNumber = await nextInvoiceNumber(effectiveBizId || userId, effectiveBizId)

    const invoice = await SalesInvoice.create({
      invoiceNumber,
      businessId: effectiveBizId ? new mongoose.Types.ObjectId(effectiveBizId) : undefined,
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

    notify({
      event:   "NEW_INVOICE",
      message: `🧾 New invoice ${invoice.invoiceNumber}\nCustomer: ${customer.name}\nAmount: ₹${grandTotal.toLocaleString("en-IN")}\nGST: ₹${taxTotal.toLocaleString("en-IN")}`,
    }).catch(() => {})

    return NextResponse.json({ success: true, invoice }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
