/**
 * Region seed data — one entry per STATE_CODES entry (src/core/gst/stateCodes.ts),
 * all disabled except the launch pilot (Andhra Pradesh). Run via
 * scripts/seed-marketplace.ts. Re-running is safe: upserts by stateCode.
 */
import { STATE_CODES } from "@/core/gst/stateCodes";

export interface RegionSeed {
  stateCode: string;
  stateName: string;
  enabled: boolean;
  cities: { name: string; enabled: boolean }[];
  enabledCategoryKeys: string[];
  locale: string;
  themeKey: string;
}

const AP_LAUNCH_CATEGORY_KEYS = [
  "appliance_repair",
  "installation_services",
  "home_cleaning",
  "pest_control",
  "electrician",
  "plumber",
];

const AP_LAUNCH_CITIES = [
  "Visakhapatnam",
  "Vijayawada",
  "Guntur",
  "Tirupati",
  "Nellore",
  "Kakinada",
  "Rajahmundry",
  "Kurnool",
];

// "Other Territory" (code 97) is a GST catch-all, not a real launchable region.
const EXCLUDED_STATE_CODES = new Set(["97"]);

export function buildRegionSeeds(): RegionSeed[] {
  return Object.entries(STATE_CODES)
    .filter(([, code]) => !EXCLUDED_STATE_CODES.has(code))
    .map(([stateName, stateCode]) => {
      const isPilot = stateName === "Andhra Pradesh";
      return {
        stateCode,
        stateName,
        enabled: isPilot,
        cities: isPilot
          ? AP_LAUNCH_CITIES.map((name) => ({ name, enabled: true }))
          : [],
        enabledCategoryKeys: isPilot ? AP_LAUNCH_CATEGORY_KEYS : [],
        locale: isPilot ? "te-IN" : "en-IN",
        themeKey: isPilot ? "andhra_pradesh" : "default",
      };
    });
}
