import { Types } from "mongoose";
import DocumentNumberConfig from "@/models/DocumentNumberConfig";
import Business from "@/models/Business";
import NumberSequence from "./NumberSequence.model";
import { getFinancialYear, getFinancialYearCode } from "./financialYear";
import { DEFAULT_PREFIXES, type DocumentType, type GeneratedNumber } from "./types";


/**
 * THE canonical document-number generator for the entire platform.
 * Everything that used to call one of the six old duplicate generators
 * (see types.ts's top comment for the full list and why several of them
 * were actively unsafe) should call generateDocumentNumber() instead.
 *
 * Behavior:
 *  1. Reads this business's DocumentNumberConfig for the given type (the
 *     SAME config the Settings > Document Numbers admin UI reads/writes —
 *     this is what makes numbering genuinely admin-configurable everywhere,
 *     not just for invoices). Falls back to a sensible default prefix if
 *     the business hasn't configured this type yet, same defaults the
 *     admin UI already shows before a business saves its own.
 *  2. Computes the period key: the financial year string if
 *     config.includeFinancialYear, else the constant "ALL" (counter never
 *     resets). This is what the counter is scoped by.
 *  3. Atomically increments NumberSequence via findOneAndUpdate + $inc —
 *     this atomicity is the property that makes it safe under concurrent
 *     requests, unlike Date.now()-based or countDocuments()-based schemes.
 *  4. Applies config.startFrom as a floor (if configured higher than the
 *     counter's current value, e.g. a business wants to start at 1001) —
 *     handled by seeding the counter's initial value to startFrom - 1 on
 *     first use of a given period key, not by re-checking on every call
 *     (which would defeat the atomicity of the $inc).
 *  5. Formats the final string from prefix/separator/financialYear/month/
 *     sequenceLength/suffix — the exact same building blocks the admin UI's
 *     buildPreview() (in /api/admin/document-numbers/route.ts) already
 *     shows a live preview of, so what the admin sees in Settings matches
 *     exactly what gets generated. That preview-building logic is
 *     duplicated here deliberately as formatNumber() below (small, pure,
 *     and safe to keep in sync since both live in this one file's
 *     neighborhood) rather than cross-importing from the API route module.
 */

interface FormatInput {
  prefix: string;
  separator: string;
  includeFinancialYear: boolean;
  includeMonth: boolean;
  sequenceLength: number;
  suffix: string;
  sequence: number;
  financialYear: string;
}

function formatNumber(input: FormatInput): string {
  const parts: string[] = [];
  if (input.prefix) parts.push(input.prefix);
  if (input.includeFinancialYear) parts.push(input.financialYear);
  if (input.includeMonth) parts.push(String(new Date().getMonth() + 1).padStart(2, "0"));
  parts.push(String(input.sequence).padStart(input.sequenceLength, "0"));
  if (input.suffix) parts.push(input.suffix);
  return parts.join(input.separator || "-");
}

/**
 * Renders a custom template string (DocumentNumberConfig.template) by
 * substituting {token} placeholders. Built-in tokens are always available;
 * everything else comes from the `context` map the calling code supplies
 * (e.g. {vendorId} for vendor product codes, or another document type's own
 * number via DOCUMENT_NUMBER_TOKENS — e.g. {invoiceNumber} in a Credit Note
 * template). Per explicit direction every document type's number is a valid
 * token in every other type's template, and most (type, token) combinations
 * have no real relationship and will never be supplied by the generating
 * call site — so a token with no match renders as "" rather than throwing,
 * instead of blocking generation for every template that references a token
 * this particular call site doesn't happen to populate.
 */
function renderTemplate(template: string, builtins: Record<string, string>, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in builtins) return builtins[key];
    if (key in context) return context[key];
    return "";
  });
}

// Fixed sentinel ObjectId used ONLY for platform-wide (not per-business)
// counters — see generateGlobalDocumentNumber() below. Any valid-looking
// constant works since NumberSequence.businessId just needs to be *a*
// ObjectId to satisfy the schema; this one is never a real Business _id.
const GLOBAL_SCOPE_ID = "000000000000000000000000";

async function generateNumberInScope(
  scopeId: string,
  documentType: DocumentType,
  configBusinessId: string | null,
  context: Record<string, string> = {}
): Promise<GeneratedNumber> {
  // Falls back to the platform-wide config (businessId: null, edited from
  // the "AN Group (Platform)" option in Settings > Document Numbers) when
  // this specific business has never saved its own override for this
  // type. Without this, a super admin customizing a type there -- VENDOR
  // especially, since VendorProfile.vendorId is globally unique across
  // every business anyway (see the GLOBAL_SCOPE_ID comment above) -- saw
  // it silently ignored the moment generation ran for any real business,
  // since every call site here passes a real businessId, never null, as
  // configBusinessId. The platform-wide row was being saved successfully
  // but never actually read by anything.
  let config = configBusinessId
    ? (await DocumentNumberConfig.findOne({ businessId: configBusinessId, documentType }).lean() as any)
    : null;
  if (!config && configBusinessId) {
    config = await DocumentNumberConfig.findOne({ businessId: null, documentType }).lean() as any;
  }

  const prefix = config?.prefix || DEFAULT_PREFIXES[documentType] || documentType.slice(0, 3);
  const separator = config?.separator ?? "-";
  const includeFinancialYear = config?.includeFinancialYear ?? true;
  const financialYearFormat: "hyphenated" | "compact" = config?.financialYearFormat ?? "hyphenated";
  const includeMonth = config?.includeMonth ?? false;
  const sequenceLength = config?.sequenceLength ?? 4;
  const suffix = config?.suffix ?? "";
  const startFrom = config?.startFrom ?? 1;
  const isActive = config?.isActive ?? true;
  const template: string = config?.template ?? "";

  if (!isActive) {
    throw new Error(
      `Numbering for document type "${documentType}" is disabled for this business. Enable it in Settings > Document Numbers.`
    );
  }

  // The DB-side period key always uses the compact code as a stable
  // internal identifier regardless of display format -- what actually
  // shows up in a generated number is a separate concern (financialYear
  // below), controlled by financialYearFormat.
  const periodKeyCode = getFinancialYearCode();
  const periodKey = includeFinancialYear ? periodKeyCode : "ALL";
  const financialYear = financialYearFormat === "compact" ? getFinancialYearCode() : getFinancialYear();

  // Ensure the counter exists and is seeded to (startFrom - 1) BEFORE the
  // atomic increment, so the increment always produces the right next
  // value even on the very first call for this scope/type/period.
  // $setOnInsert only applies on the insert branch of the upsert, so this
  // is safe to run on every call without resetting an existing counter.
  await NumberSequence.updateOne(
    { businessId: new Types.ObjectId(scopeId), documentType, periodKey },
    { $setOnInsert: { value: startFrom - 1 } },
    { upsert: true }
  );

  const updated = await NumberSequence.findOneAndUpdate(
    { businessId: new Types.ObjectId(scopeId), documentType, periodKey },
    { $inc: { value: 1 } },
    { new: true }
  );

  const sequence = updated!.value;

  let value: string;
  if (template.trim()) {
    const now = new Date();
    const builtins: Record<string, string> = {
      prefix,
      fy: financialYear,
      month: String(now.getMonth() + 1).padStart(2, "0"),
      year: String(now.getFullYear()),
      day: String(now.getDate()).padStart(2, "0"),
      seq: String(sequence).padStart(sequenceLength, "0"),
      suffix,
    };

    // {businessCode}/{businessName} are automatic built-ins derived from
    // configBusinessId -- every generator function already takes a
    // businessId, so there's no reason to make every call site fetch and
    // pass these itself. Only looked up when the template actually
    // references one, to avoid an extra DB round-trip on the common
    // structured-format (no custom template) path.
    if (configBusinessId && (template.includes("{businessCode}") || template.includes("{businessName}"))) {
      const business = await Business.findById(configBusinessId).select("businessCode name").lean();
      if ((business as any)?.businessCode) builtins.businessCode = (business as any).businessCode;
      if ((business as any)?.name) builtins.businessName = (business as any).name;
    }

    value = renderTemplate(template, builtins, context);
  } else {
    value = formatNumber({
      prefix,
      separator,
      includeFinancialYear,
      includeMonth,
      sequenceLength,
      suffix,
      sequence,
      financialYear,
    });
  }

  return { value, sequence };
}

export async function generateDocumentNumber(
  businessId: string,
  documentType: DocumentType,
  context: Record<string, string> = {}
): Promise<GeneratedNumber> {
  if (!businessId) {
    throw new Error("businessId is required to generate a document number");
  }
  return generateNumberInScope(businessId, documentType, businessId, context);
}

/**
 * For the rare document types that are GLOBALLY unique across the whole
 * platform rather than per-business — currently just VENDOR, whose
 * VendorProfile.vendorId has a schema-level `unique: true` with no
 * businessId in the index (a pre-existing constraint discovered while
 * consolidating vendor-ID generation — see the removed-code comments in
 * app/api/vendors/route.ts, vendors/apply/route.ts, and
 * auth/register/vendor/route.ts). Uses one shared platform-wide counter
 * (GLOBAL_SCOPE_ID) instead of per-business scoping, which would violate
 * that uniqueness constraint the same way an earlier, already-fixed bug
 * did (see the comment history in those files). Numbering format still
 * comes from the calling business's own DocumentNumberConfig if provided
 * (businessIdForConfig) — only the COUNTER is global, not the format.
 */
/**
 * Scopes the atomic counter by an arbitrary ObjectId-shaped key instead of
 * a real Business — used for vendor-scoped product codes
 * ("ECOM-VND-0001-PRD-0001"), where the sequence must reset per-vendor, not
 * per-business. Format still comes from the business's own
 * DocumentNumberConfig (businessIdForConfig) for consistency with every
 * other document type; only the counter's scope key differs.
 */
export async function generateScopedDocumentNumber(
  scopeKey: string,
  documentType: DocumentType,
  businessIdForConfig: string | null,
  context: Record<string, string> = {}
): Promise<GeneratedNumber> {
  return generateNumberInScope(scopeKey, documentType, businessIdForConfig, context);
}

export async function generateGlobalDocumentNumber(
  documentType: DocumentType,
  businessIdForConfig: string | null = null,
  context: Record<string, string> = {}
): Promise<GeneratedNumber> {
  return generateNumberInScope(GLOBAL_SCOPE_ID, documentType, businessIdForConfig, context);
}
