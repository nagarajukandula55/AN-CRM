// Re-exported client-safe copy of DesignComponent's category enum — kept
// separate from the Mongoose model file so client components can import
// the category list without pulling in mongoose/server-only code.
export type DesignComponentCategory =
  | "LOGO"
  | "LABEL_PIECE"
  | "TEXT_BLOCK"
  | "GRAPHIC"
  | "BARCODE"
  | "OTHER";

export const DESIGN_COMPONENT_CATEGORIES: DesignComponentCategory[] = [
  "LOGO",
  "LABEL_PIECE",
  "TEXT_BLOCK",
  "GRAPHIC",
  "BARCODE",
  "OTHER",
];
