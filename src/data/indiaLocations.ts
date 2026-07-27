/**
 * Single source of truth for Indian State -> City data, replacing the two
 * duplicated `INDIAN_STATES` arrays that used to live independently in
 * src/app/register/page.tsx and src/app/admin/vendors/page.tsx (names only,
 * no cities, disconnected from the GST state-code map in
 * src/core/gst/stateCodes.ts).
 *
 * Data lives in india-states-cities.json (a curated city list per state/UT)
 * so it can be updated/regenerated independently of code. This module is
 * the only place that should import that JSON file directly — every form
 * should go through STATE_NAMES / getCitiesForState() instead.
 */
import statesCitiesData from "./india-states-cities.json";
import { STATE_CODES } from "@/core/gst/stateCodes";

type StateCityMap = Record<string, string[]>;

const DATA = statesCitiesData as StateCityMap;

/** Alphabetically sorted list of all Indian state/UT names. */
export const STATE_NAMES: string[] = Object.keys(DATA).sort((a, b) =>
  a.localeCompare(b)
);

/** Returns the sorted city list for a given state/UT name, or []. */
export function getCitiesForState(stateName?: string): string[] {
  if (!stateName) return [];
  const cities = DATA[stateName];
  return cities ? [...cities].sort((a, b) => a.localeCompare(b)) : [];
}

/** True if the given name is a recognised Indian state/UT. */
export function isValidState(stateName?: string): boolean {
  return !!stateName && Object.prototype.hasOwnProperty.call(DATA, stateName);
}

/**
 * True if `cityName` is in our curated list for `stateName`. Kept lenient
 * (case-insensitive) since the dataset is a curated subset, not
 * exhaustive — callers should treat this as a soft hint, not hard
 * validation, and allow free-text entry for cities/towns we haven't
 * listed yet.
 */
export function isKnownCity(stateName?: string, cityName?: string): boolean {
  if (!stateName || !cityName) return false;
  const cities = DATA[stateName] || [];
  return cities.some((c) => c.toLowerCase() === cityName.toLowerCase());
}

/**
 * Every state/UT name here should also exist in STATE_CODES
 * (src/core/gst/stateCodes.ts) so GSTIN state-code cross-validation works
 * for all of them. Exported for use in a dev-time consistency check /
 * test rather than asserted at import time (avoids crashing the app if a
 * name is ever momentarily out of sync).
 */
export function getStatesMissingGstCode(): string[] {
  return STATE_NAMES.filter((name) => !STATE_CODES[name]);
}
