/**
 * Browser-only export helpers for the Design Studio editor — all downloads
 * happen entirely client-side (no server round-trip). Kept framework-free
 * (no Fabric import) so it's safe to import from anywhere without pulling
 * Fabric into a non-client bundle.
 */
import { DESIGN_DPI } from "./sizePresets";

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadTextFile(content: string, filename: string, mime = "image/svg+xml") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Pixel size (assumed 300dpi, same convention as sizePresets.ts) -> mm, for
// jsPDF's addImage(), which takes physical page units.
export function pxToMm(px: number, dpi: number = DESIGN_DPI): number {
  const inches = px / dpi;
  return inches * 25.4;
}
