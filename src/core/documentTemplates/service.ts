import { Types } from "mongoose";
import DocumentTemplate, {
  type DocumentTemplateType,
  type ITemplateBlock,
} from "@/models/DocumentTemplate";
import { defaultBlocksFor } from "./blockPalette";

export async function listTemplates(businessId: string, documentType?: string) {
  const query: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (documentType) query.documentType = documentType;
  return DocumentTemplate.find(query).sort({ documentType: 1, createdAt: -1 }).lean();
}

export async function getTemplate(id: string) {
  return DocumentTemplate.findById(id).lean();
}

export async function createTemplate(input: {
  businessId: string;
  documentType: DocumentTemplateType;
  name: string;
  blocks?: ITemplateBlock[];
  accentColor?: string;
  logoUrl?: string;
  isDefault?: boolean;
}) {
  const blocks = input.blocks && input.blocks.length > 0 ? input.blocks : defaultBlocksFor(input.documentType);

  if (input.isDefault) {
    await DocumentTemplate.updateMany(
      { businessId: input.businessId, documentType: input.documentType, isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  return DocumentTemplate.create({
    businessId: new Types.ObjectId(input.businessId),
    documentType: input.documentType,
    name: input.name,
    blocks,
    accentColor: input.accentColor || "#111827",
    logoUrl: input.logoUrl,
    isDefault: !!input.isDefault,
  });
}

export async function updateTemplate(
  id: string,
  updates: Partial<{
    name: string;
    blocks: ITemplateBlock[];
    accentColor: string;
    logoUrl: string;
    isDefault: boolean;
  }>
) {
  const existing = await DocumentTemplate.findById(id);
  if (!existing) return null;

  if (updates.isDefault) {
    await DocumentTemplate.updateMany(
      { businessId: existing.businessId, documentType: existing.documentType, isDefault: true, _id: { $ne: existing._id } },
      { $set: { isDefault: false } }
    );
  }

  Object.assign(existing, updates);
  await existing.save();
  return existing;
}

export async function deleteTemplate(id: string) {
  return DocumentTemplate.findByIdAndDelete(id);
}
