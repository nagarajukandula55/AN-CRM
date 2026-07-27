import DocumentTemplate, { type DocumentTemplateType } from "@/models/DocumentTemplate";
import { defaultBlocksFor } from "./blockPalette";

export interface ResolvedTemplate {
  blocks: ReturnType<typeof defaultBlocksFor>;
  accentColor: string;
  logoUrl?: string;
}

/**
 * The one place "which template does this business/documentType use" is
 * answered — mirrors core/invoiceTemplates/service.ts's renderInvoiceForBusiness
 * fallback pattern: use the saved default if one exists, otherwise the
 * built-in starting block order (defaultBlocksFor) with no branding
 * override, so a business that's never touched the builder still gets a
 * sensible document instead of an error.
 */
export async function getTemplateForBusiness(
  businessId: string,
  documentType: DocumentTemplateType
): Promise<ResolvedTemplate> {
  const saved = await DocumentTemplate.findOne({
    businessId,
    documentType,
    isDefault: true,
  }).lean<any>();

  if (saved) {
    return {
      blocks: saved.blocks,
      accentColor: saved.accentColor,
      logoUrl: saved.logoUrl,
    };
  }

  return {
    blocks: defaultBlocksFor(documentType),
    accentColor: "#111827",
  };
}
