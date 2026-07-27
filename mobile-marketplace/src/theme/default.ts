import type { ResolvedTheme } from "../api/region";

// Mirrors src/data/seed/regionThemes.seed.ts's "default" entry -- client-side
// fallback so the app shell renders before region-resolution exists/succeeds.
export const DEFAULT_THEME: ResolvedTheme = {
  key: "default",
  displayName: "Default",
  palette: {
    primary: "#2F6F4E",
    secondary: "#1F2933",
    accent: "#F2A93B",
    background: "#FFFFFF",
  },
  landmarkAssetUrls: [],
  localeBundleKey: "en-IN",
  greetingTemplates: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },
  festivalBanners: [],
};
