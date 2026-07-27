/**
 * Business logic for admin-editable invoice templates — shared by the
 * API routes and (potentially) ANu later, same "one service, multiple
 * callers" pattern as core/gst/gstFilingService.ts and
 * core/numbering/numberingService.ts.
 */

import { Types } from "mongoose";
import InvoiceTemplate, { IInvoiceTemplate, InvoiceLayoutKey } from "@/models/InvoiceTemplate";
import { getLayout } from "./registry";
import type { InvoiceRenderData } from "./types";

export interface SaveTemplateInput {
  businessId: string;
  layoutKey: InvoiceLayoutKey;
  name: string;
  isDefault?: boolean;
  branding?: { logoUrl?: string; accentColor?: string; tagline?: string };
  text?: {
    footerNote?: string;
    declaration?: string;
    termsAndConditions?: string;
    showSignature?: boolean;
    signatureImageUrl?: string;
    signatoryLabel?: string;
  };
}

export async function listTemplates(businessId: string) {
  return InvoiceTemplate.find({ businessId: new Types.ObjectId(businessId) })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}

export async function getDefaultTemplate(businessId: string) {
  return InvoiceTemplate.findOne({
    businessId: new Types.ObjectId(businessId),
    isDefault: true,
  }).lean();
}

/**
 * Creates or updates a saved template. If `isDefault` is set, unsets any
 * previous default for this business first — the partial unique index on
 * InvoiceTemplate.ts enforces at most one default per business, but a
 * plain upsert would otherwise conflict with that index rather than
 * gracefully swap the default over.
 */
export async function saveTemplate(input: SaveTemplateInput, templateId?: string): Promise<IInvoiceTemplate> {
  if (input.isDefault) {
    await InvoiceTemplate.updateMany(
      { businessId: new Types.ObjectId(input.businessId), isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  const update = {
    businessId: new Types.ObjectId(input.businessId),
    layoutKey: input.layoutKey,
    name: input.name,
    isDefault: !!input.isDefault,
    branding: input.branding || {},
    text: input.text || {},
  };

  if (templateId) {
    const updated = await InvoiceTemplate.findByIdAndUpdate(templateId, { $set: update }, { new: true });
    if (!updated) throw new Error(`Template ${templateId} not found`);
    return updated;
  }

  return InvoiceTemplate.create(update);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await InvoiceTemplate.findByIdAndDelete(templateId);
}

/**
 * Renders invoice HTML using a business's default template (or the
 * platform default layout with no customization if none has been saved
 * yet) — the one function both the Cloudinary-snapshot generation path
 * and any future preview/download endpoint should call, so "which
 * template is this business using" is answered in exactly one place.
 */
export async function renderInvoiceForBusiness(businessId: string, data: InvoiceRenderData): Promise<string> {
  const saved = await getDefaultTemplate(businessId);
  const layout = getLayout(saved?.layoutKey);

  const merged: InvoiceRenderData = {
    ...data,
    company: {
      ...data.company,
      logoUrl: saved?.branding?.logoUrl || data.company.logoUrl,
      tagline: saved?.branding?.tagline || data.company.tagline,
    },
    templateConfig: {
      accentColor: saved?.branding?.accentColor,
      footerNote: saved?.text?.footerNote,
      declaration: saved?.text?.declaration,
      termsAndConditions: saved?.text?.termsAndConditions,
      showSignature: saved?.text?.showSignature,
      signatureImageUrl: saved?.text?.signatureImageUrl,
      signatoryLabel: saved?.text?.signatoryLabel,
    },
  };

  return layout.renderHTML(merged);
}
