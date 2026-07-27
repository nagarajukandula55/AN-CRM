/**
 * Fixed palette of blocks the drag-and-drop template builder offers, plus
 * a sensible default block order per document type so a newly-created
 * template isn't blank. See models/DocumentTemplate.ts for why this is a
 * fixed palette rather than freeform HTML.
 */
import type { TemplateBlockType, DocumentTemplateType, ITemplateBlock } from "@/models/DocumentTemplate";

export interface BlockPaletteEntry {
  type: TemplateBlockType;
  label: string;
  description: string;
}

export const BLOCK_PALETTE: BlockPaletteEntry[] = [
  { type: "header", label: "Document Header", description: "Document type title, e.g. 'TAX INVOICE' or 'PURCHASE ORDER', plus document number/date." },
  { type: "company-details", label: "Company Details", description: "Your business's name, logo, address, GSTIN, contact info." },
  { type: "party-details", label: "Party Details", description: "The customer/vendor this document is addressed to, plus shipping info if applicable." },
  { type: "items-table", label: "Line Items Table", description: "The table of items/products/services with quantity, rate, tax, total." },
  { type: "totals", label: "Totals Summary", description: "Subtotal, tax breakdown, grand total." },
  { type: "terms", label: "Terms & Notes", description: "Terms and conditions, payment terms, or a footer note." },
  { type: "signature", label: "Signature Block", description: "Authorized signatory line, optionally with a signature image." },
  { type: "custom-text", label: "Custom Text", description: "Any free text block you want to insert, e.g. a declaration or a promotional message." },
  { type: "spacer", label: "Spacer", description: "Adds vertical space between blocks." },
];

// crypto.randomUUID is available in the Node/edge runtimes Next.js API
// routes run in — safe across concurrent requests, unlike a module-level
// counter (which resets per lambda cold start and can collide).
function newBlockId(): string {
  try {
    return `blk_${crypto.randomUUID()}`;
  } catch {
    return `blk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

/** A reasonable starting block order per document type, so a fresh template isn't empty. */
export function defaultBlocksFor(documentType: DocumentTemplateType): ITemplateBlock[] {
  const base: TemplateBlockType[] = [
    "header",
    "company-details",
    "party-details",
    "items-table",
    "totals",
    "terms",
    "signature",
  ];
  return base.map((type) => ({ id: newBlockId(), type, config: {} }));
}

export function makeBlock(type: TemplateBlockType): ITemplateBlock {
  return { id: newBlockId(), type, config: {} };
}
