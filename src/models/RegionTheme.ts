/**
 * RegionTheme — the cultural-localization "theme pack" a Region points to
 * via `themeKey`. One theme can be shared by multiple regions (default),
 * but a pilot state like Andhra Pradesh gets its own dedicated theme so the
 * app reads as built *for* that state rather than a national app with a
 * language switch. Content-only model (palette tokens + asset refs +
 * locale bundle ref) so adding a new state's look is a data/content task,
 * not a rebuild — see docs/marketplace-app/region-theme-design.md.
 */
import mongoose, { Schema, Model, Document } from "mongoose";

export interface IRegionThemePalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface IRegionTheme extends Document {
  key: string; // e.g. "andhra_pradesh", "default"
  displayName: string;
  palette: IRegionThemePalette;
  motifAssetUrl?: string; // subtle background/line-art motif
  landmarkAssetUrls: string[]; // rotating home-banner imagery
  localeBundleKey: string; // i18n bundle to load, e.g. "te-IN"
  greetingTemplates: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  festivalBanners: {
    name: string; // e.g. "Ugadi"
    month: number; // 1-12, approximate trigger month
    bannerAssetUrl?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const RegionThemeSchema = new Schema<IRegionTheme>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    palette: {
      primary: { type: String, required: true },
      secondary: { type: String, required: true },
      accent: { type: String, required: true },
      background: { type: String, required: true },
    },
    motifAssetUrl: { type: String },
    landmarkAssetUrls: { type: [String], default: [] },
    localeBundleKey: { type: String, default: "en-IN" },
    greetingTemplates: {
      morning: { type: String, default: "Good morning" },
      afternoon: { type: String, default: "Good afternoon" },
      evening: { type: String, default: "Good evening" },
    },
    festivalBanners: {
      type: [
        {
          name: { type: String, required: true },
          month: { type: Number, required: true, min: 1, max: 12 },
          bannerAssetUrl: { type: String },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const RegionTheme: Model<IRegionTheme> =
  (mongoose.models.RegionTheme as Model<IRegionTheme>) ||
  mongoose.model<IRegionTheme>("RegionTheme", RegionThemeSchema);

export default RegionTheme;
