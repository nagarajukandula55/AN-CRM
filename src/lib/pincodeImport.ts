/**
 * Shared CSV -> normalized pincode-entry conversion, used by both the
 * one-time seed script (scripts/seedPincodes.ts) and the admin upload
 * route (api/admin/pincode-data) so the exact same normalization logic
 * applies whether the data comes in via a script or a file upload.
 *
 * Expects the standard official India Post "All India Pincode Directory"
 * CSV columns: circlename, regionname, divisionname, officename, pincode,
 * officetype, delivery, district, statename, latitude, longitude. Only
 * pincode / district / statename / officename are actually used.
 */
import { parseCSVToObjects } from "@/lib/csv";

export interface NormalizedPincodeEntry {
  pincode: string;
  state: string;
  district: string;
  city: string;
}

// India Post's statename values don't always match our canonical
// STATE_NAMES casing/wording (src/data/indiaLocations.ts) — normalize the
// handful of known mismatches here rather than silently dropping those
// pincodes or leaving them un-selectable in the StateSelect dropdown.
const STATE_NORMALIZE: Record<string, string> = {
  "ANDAMAN AND NICOBAR ISLANDS": "Andaman and Nicobar Islands",
  "JAMMU AND KASHMIR": "Jammu and Kashmir",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU":
    "Dadra and Nagar Haveli and Daman and Diu",
  "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU":
    "Dadra and Nagar Haveli and Daman and Diu",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeState(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (STATE_NORMALIZE[upper]) return STATE_NORMALIZE[upper];
  return titleCase(raw.trim());
}

function stripOfficeSuffix(office: string): string {
  for (const suffix of [" B.O", " S.O", " H.O"]) {
    if (office.endsWith(suffix)) return office.slice(0, -suffix.length).trim();
  }
  return office.trim();
}

export interface ConversionResult {
  entries: NormalizedPincodeEntry[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Converts raw pincode-directory CSV text into a deduplicated map of
 * pincode -> {state, district, city}. Multiple post offices can share the
 * same pincode; district is used as the "city" value (a clean, real place
 * name) with the shortest distinct office name as a fallback only when
 * district is blank.
 */
export function convertPincodeCSV(csvText: string): ConversionResult {
  const rows = parseCSVToObjects(csvText);
  const byPin = new Map<
    string,
    { state: string; district: string; offices: Set<string> }
  >();
  let skippedRows = 0;

  for (const row of rows) {
    const pin = (row.pincode || "").trim();
    const stateRaw = (row.statename || "").trim();
    const district = (row.district || "").trim();
    const office = (row.officename || "").trim();

    if (!/^[0-9]{6}$/.test(pin)) {
      skippedRows++;
      continue;
    }
    if (!stateRaw || stateRaw.toUpperCase() === "NA") {
      skippedRows++;
      continue;
    }

    const state = normalizeState(stateRaw);
    const districtTitle = district ? titleCase(district) : "";

    if (!byPin.has(pin)) {
      byPin.set(pin, { state, district: districtTitle, offices: new Set() });
    }
    if (office) {
      byPin.get(pin)!.offices.add(stripOfficeSuffix(office));
    }
  }

  const entries: NormalizedPincodeEntry[] = [];
  for (const [pincode, info] of byPin.entries()) {
    let city = info.district;
    if (!city) {
      const offices = [...info.offices].sort(
        (a, b) => a.length - b.length || a.localeCompare(b)
      );
      city = offices[0] || "";
    }
    entries.push({ pincode, state: info.state, district: info.district, city });
  }

  return { entries, totalRows: rows.length, skippedRows };
}
