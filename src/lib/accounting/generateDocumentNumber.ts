import DocumentCounter from "@/models/DocumentCounter";
import DocumentNumberConfig from "@/models/DocumentNumberConfig";
import { getFinancialYear } from "./getFinancialYear";

type Params = {
  businessId: string;
  documentType: string;
  prefix?: string; // fallback if no config saved
};

/**
 * Build the formatted document number string from config + counter.
 * Uses the DocumentNumberConfig for the business if one exists,
 * otherwise falls back to the legacy prefix-documentType-year-seq format.
 */
export async function generateDocumentNumber({
  businessId,
  documentType,
  prefix = "NA",
}: Params): Promise<string> {
  const financialYear = getFinancialYear();

  // ── 1. Load config (may not exist yet) ────────────────────────────────────
  const config = await DocumentNumberConfig.findOne({
    businessId,
    documentType,
    isActive: true,
  }).lean();

  const sep = config?.separator ?? "-";
  const resolvedPrefix = config?.prefix || prefix;
  const seqLen = config?.sequenceLength ?? 4;
  const includeYear = config?.includeFinancialYear ?? true;
  const includeMonth = config?.includeMonth ?? false;
  const suffix = config?.suffix ?? "";

  // ── 2. Atomically increment counter ───────────────────────────────────────
  const counter = await DocumentCounter.findOneAndUpdate(
    { businessId, documentType, financialYear },
    {
      $inc: { current: 1 },
      $setOnInsert: { prefix: resolvedPrefix },
    },
    { new: true, upsert: true }
  );

  const sequence = String(counter.current).padStart(seqLen, "0");

  // ── 3. Assemble parts ─────────────────────────────────────────────────────
  const parts: string[] = [];

  if (resolvedPrefix) parts.push(resolvedPrefix);
  if (includeYear) parts.push(financialYear);
  if (includeMonth) {
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    parts.push(month);
  }
  parts.push(sequence);
  if (suffix) parts.push(suffix);

  return parts.join(sep);
}
