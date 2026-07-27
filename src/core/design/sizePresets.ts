/**
 * Canvas size presets for the Design Studio "new design" picker. All
 * dimensions are in pixels, computed at 300dpi from the labeled real-world
 * size (used again by the editor's PDF export to convert back to
 * inches/mm — see exportUtils.ts).
 */
export interface SizePreset {
  key: string;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const DESIGN_SIZE_PRESETS: SizePreset[] = [
  { key: "label-small", label: "Product Label — Small", width: 600, height: 300, description: "2in x 1in @ 300dpi" },
  { key: "label-medium", label: "Product Label — Medium", width: 1200, height: 600, description: "4in x 2in @ 300dpi" },
  { key: "label-large", label: "Product Label — Large", width: 1200, height: 1800, description: "4in x 6in @ 300dpi" },
  { key: "business-card", label: "Business Card", width: 1050, height: 600, description: "3.5in x 2in @ 300dpi" },
  { key: "social-post", label: "Social Post", width: 1080, height: 1080, description: "1080 x 1080 px" },
  { key: "a4-portrait", label: "A4 Portrait", width: 2480, height: 3508, description: "A4 @ 300dpi" },
  { key: "letter", label: "Letter", width: 2550, height: 3300, description: "Letter @ 300dpi" },
];

export const DESIGN_DPI = 300;
