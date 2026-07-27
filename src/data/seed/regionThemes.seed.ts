/**
 * RegionTheme seed data. "default" covers every region until it gets a
 * dedicated theme; "andhra_pradesh" is the first reference cultural theme
 * pack (pilot state) -- palette/motif/landmark choices per
 * docs/marketplace-app/region-theme-design.md. Asset URLs are left blank
 * (placeholders) -- real artwork must be produced and uploaded before
 * launch, this seed only wires up the structure.
 */
import type { IRegionTheme } from "@/models/RegionTheme";

type ThemeSeed = Pick<
  IRegionTheme,
  | "key"
  | "displayName"
  | "palette"
  | "landmarkAssetUrls"
  | "localeBundleKey"
  | "greetingTemplates"
  | "festivalBanners"
>;

export const REGION_THEME_SEEDS: ThemeSeed[] = [
  {
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
  },
  {
    key: "andhra_pradesh",
    displayName: "Andhra Pradesh",
    palette: {
      // Kalamkari-inspired maroon/mango-yellow with a coastal teal accent --
      // deliberately not the generic "tech blue" SaaS palette.
      primary: "#8C2F1B", // Kalamkari maroon-red
      secondary: "#E8A93B", // mango yellow
      accent: "#1E6E73", // Bay of Bengal teal
      background: "#FFF8EF",
    },
    landmarkAssetUrls: [
      // Placeholders -- real Tirupati gopuram / Araku Valley / Vizag RK
      // Beach imagery to be commissioned/licensed before launch.
    ],
    localeBundleKey: "te-IN",
    greetingTemplates: {
      morning: "శుభోదయం", // Good morning
      afternoon: "శుభ మధ్యాహ్నం", // Good afternoon
      evening: "శుభ సాయంత్రం", // Good evening
    },
    festivalBanners: [
      { name: "Ugadi", month: 3 },
      { name: "Sankranti", month: 1 },
      { name: "Vinayaka Chavithi", month: 9 },
    ],
  },
];
