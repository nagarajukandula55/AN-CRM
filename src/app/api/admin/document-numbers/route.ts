import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import DocumentNumberConfig, {
  DOCUMENT_TYPES,
} from "@/models/DocumentNumberConfig";
// Was @/lib/accounting/getFinancialYear — one of 3 duplicate FY calculators
// that didn't even agree on output format with each other (see
// core/numbering/financialYear.ts's top comment). Now uses the canonical one.
import { getFinancialYear, getFinancialYearCode } from "@/core/numbering/financialYear";
import { DEFAULT_PREFIXES } from "@/core/numbering/types";
import { logAction } from "@/lib/audit/logAction";

// Sample values shown in a custom-template preview for tokens that only a
// real generating call site can supply (e.g. {vendorId}) -- lets an admin
// see roughly what their template will look like without needing a real
// vendor/customer to test against. Real generation still requires the
// actual caller to pass these tokens (see numberingService.ts's
// renderTemplate) -- this is preview-only.
const PREVIEW_CONTEXT: Record<string, string> = {
  vendorId: "VND-0001",
  customerId: "CUST-0001",
  businessCode: "BIZ-01",
  businessName: "Sample Business",
};

/* helper: build the format preview string from config fields */
function buildPreview(
  prefix: string,
  separator: string,
  includeFinancialYear: boolean,
  includeMonth: boolean,
  sequenceLength: number,
  suffix: string,
  financialYearFormat: "hyphenated" | "compact" = "hyphenated",
  template?: string
): string {
  const financialYear = financialYearFormat === "compact" ? getFinancialYearCode() : getFinancialYear();

  if (template && template.trim()) {
    try {
      return template.replace(/\{(\w+)\}/g, (match, key: string) => {
        const builtins: Record<string, string> = {
          prefix,
          fy: financialYear,
          month: "MM",
          year: String(new Date().getFullYear()),
          day: "DD",
          seq: "0".repeat(sequenceLength),
          suffix,
        };
        if (key in builtins) return builtins[key];
        if (key in PREVIEW_CONTEXT) return PREVIEW_CONTEXT[key];
        // Matches renderTemplate()'s real runtime behavior (numberingService.ts) --
        // a token nothing supplies a value for renders as "", not literal "{key}".
        return "";
      });
    } catch {
      return "(invalid template)";
    }
  }

  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (includeFinancialYear) parts.push(financialYear);
  if (includeMonth) parts.push("MM");
  parts.push("0".repeat(sequenceLength));
  if (suffix) parts.push(suffix);
  return parts.join(separator || "-");
}

/* =========================================================
 * GET — list all configs for a business, with defaults for
 *       any doc type that has no saved config yet
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const rawBusinessId = searchParams.get("businessId");
    if (!rawBusinessId)
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );

    // "AN_GROUP" is the frontend's sentinel for the platform-wide config
    // (businessId: null on the model — see DocumentNumberConfig.ts's top
    // comment). This translation was documented but never actually
    // implemented: both this route and POST below were saving/reading the
    // literal string "AN_GROUP" as businessId instead of null, so a super
    // admin's platform-wide edits were stored under a value nothing else
    // (including numberingService.ts's fallback lookup) ever queried for.
    const businessId: string | null = rawBusinessId === "AN_GROUP" ? null : rawBusinessId;

    const saved = await DocumentNumberConfig.find({ businessId }).lean();
    const savedMap = new Map(saved.map((c: any) => [c.documentType, c]));

    // Build full list — saved config or sensible defaults per type. Reuses
    // DEFAULT_PREFIXES from the canonical numbering engine (core/numbering/
    // types.ts) instead of a separately hand-maintained map, so this UI's
    // defaults can never drift out of sync with what generateDocumentNumber()
    // itself falls back to when a business hasn't configured a type yet.
    const defaults: Record<string, string> = DEFAULT_PREFIXES;

    const configs = DOCUMENT_TYPES.map((docType: string) => {
      const existing = savedMap.get(docType);
      if (existing) return existing;

      const prefix = defaults[docType] ?? docType.slice(0, 3);
      return {
        businessId,
        documentType: docType,
        prefix,
        separator: "-",
        includeFinancialYear: true,
        financialYearFormat: "hyphenated",
        includeMonth: false,
        sequenceLength: 4,
        suffix: "",
        template: "",
        startFrom: 1,
        isActive: true,
        formatPreview: buildPreview(prefix, "-", true, false, 4, "", "hyphenated", ""),
        _saved: false,
      };
    });

    return NextResponse.json({ success: true, data: configs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/* =========================================================
 * POST — create or update (upsert) a single config
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      businessId: rawBusinessId,
      documentType,
      prefix = "",
      separator = "-",
      includeFinancialYear = true,
      financialYearFormat = "hyphenated",
      includeMonth = false,
      sequenceLength = 4,
      suffix = "",
      template = "",
      startFrom = 1,
      isActive = true,
    } = body;

    if (!rawBusinessId || !documentType)
      return NextResponse.json(
        { error: "businessId and documentType are required" },
        { status: 400 }
      );

    if (financialYearFormat !== "hyphenated" && financialYearFormat !== "compact") {
      return NextResponse.json(
        { error: 'financialYearFormat must be "hyphenated" or "compact"' },
        { status: 400 }
      );
    }

    // Same "AN_GROUP" -> null translation as GET above.
    const businessId: string | null = rawBusinessId === "AN_GROUP" ? null : rawBusinessId;

    const formatPreview = buildPreview(
      prefix,
      separator,
      includeFinancialYear,
      includeMonth,
      sequenceLength,
      suffix,
      financialYearFormat,
      template
    );

    const config = await DocumentNumberConfig.findOneAndUpdate(
      { businessId, documentType },
      {
        $set: {
          prefix,
          separator,
          includeFinancialYear,
          financialYearFormat,
          includeMonth,
          sequenceLength,
          suffix,
          template,
          startFrom,
          isActive,
          formatPreview,
          updatedBy: userId,
        },
        $setOnInsert: { createdBy: userId },
      },
      { upsert: true, new: true }
    );

    logAction({
      action: "UPDATE",
      entity: "DocumentNumberConfig",
      entityId: config?._id?.toString(),
      after: config,
      req,
      actor: { id: userId, businessId },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
