/**
 * GST 2-digit state codes, keyed by state name. Extracted from what used
 * to be an inline const duplicated inside
 * app/api/invoice/view/[invoiceNumber]/route.ts — pulled out here so the
 * new Cloudinary-generation path (api/invoice/generate/route.ts) can use
 * the SAME lookup instead of copy-pasting a second 28-entry map that would
 * inevitably drift from this one.
 *
 * Extended to cover ALL states AND union territories per the official GST
 * state code list (CBIC), not just the 28 states from the original extract
 * — union territories (Delhi excepted, which was already present) each
 * have their own GSTIN state code and are needed for the shared
 * StateSelect / GSTIN validator to work anywhere in the country.
 */
export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01",
  "Himachal Pradesh": "02",
  Punjab: "03",
  Chandigarh: "04",
  Uttarakhand: "05",
  Haryana: "06",
  Delhi: "07",
  Rajasthan: "08",
  "Uttar Pradesh": "09",
  Bihar: "10",
  Sikkim: "11",
  "Arunachal Pradesh": "12",
  Nagaland: "13",
  Manipur: "14",
  Mizoram: "15",
  Tripura: "16",
  Meghalaya: "17",
  Assam: "18",
  "West Bengal": "19",
  Jharkhand: "20",
  Odisha: "21",
  Chhattisgarh: "22",
  "Madhya Pradesh": "23",
  Gujarat: "24",
  "Daman and Diu": "25",
  "Dadra and Nagar Haveli and Daman and Diu": "26",
  Maharashtra: "27",
  Karnataka: "29",
  Goa: "30",
  Lakshadweep: "31",
  Kerala: "32",
  "Tamil Nadu": "33",
  Puducherry: "34",
  "Andaman and Nicobar Islands": "35",
  Telangana: "36",
  "Andhra Pradesh": "37",
  Ladakh: "38",
  "Other Territory": "97",
};

export function getStateCode(stateName?: string): string {
  return STATE_CODES[stateName || ""] || "";
}

/** Reverse lookup: 2-digit GST state code -> state/UT name. */
export function getStateNameFromCode(code?: string): string {
  if (!code) return "";
  const entry = Object.entries(STATE_CODES).find(([, c]) => c === code);
  return entry ? entry[0] : "";
}
