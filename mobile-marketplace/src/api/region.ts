import { apiFetch } from "./client";

export type AppMode = "customer" | "provider" | "ops";

export interface ResolvedRegion {
  stateCode: string;
  stateName: string;
  locale: string;
  themeKey: string;
  enabledCategoryKeys: string[];
}

export interface ResolvedTheme {
  key: string;
  displayName: string;
  palette: { primary: string; secondary: string; accent: string; background: string };
  landmarkAssetUrls: string[];
  localeBundleKey: string;
  greetingTemplates: { morning: string; afternoon: string; evening: string };
  festivalBanners: { name: string; month: number; bannerAssetUrl?: string }[];
}

// Backed by a not-yet-built /api/region/resolve route -- see
// docs/marketplace-app/region-theme-design.md. Placeholder shape only.
export function resolveRegion(): Promise<ResolvedRegion> {
  return apiFetch<ResolvedRegion>("/api/region/resolve");
}

export function getTheme(themeKey: string): Promise<ResolvedTheme> {
  return apiFetch<ResolvedTheme>(`/api/region/theme/${themeKey}`);
}
