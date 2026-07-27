/**
 * GSTIN (GST Identification Number) validation.
 *
 * A GSTIN is 15 characters: 2-digit state code + 10-char PAN + 1-digit
 * entity number + 1 default char ('Z') + 1 checksum char, e.g.
 * "27AABCU9603R1ZX" (Maharashtra, PAN AABCU9603R, entity 1, checksum X).
 *
 * Previously NO form in the codebase validated this at all (confirmed via
 * a full-repo search) — every gstNumber/gstin field just accepted
 * arbitrary text. This adds both a structural format check and the real
 * checksum algorithm GSTN uses, so typos are caught client-side before
 * hitting the backend or a real GST filing/e-invoice call.
 */
import { getStateNameFromCode } from "@/core/gst/stateCodes";

const GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// 2 digits (state code) + 5 letters + 4 digits (PAN) + 1 letter (PAN) +
// 1 digit (entity number, 1-9 or A-Z) + 'Z' (fixed) + 1 alphanumeric (checksum)
const GSTIN_FORMAT_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface GstValidationResult {
  valid: boolean;
  /** Human-readable reason when valid === false. */
  reason?: string;
  /** State name derived from the GSTIN's leading 2-digit code, if valid format. */
  stateFromCode?: string;
}

/**
 * Computes the GSTIN checksum character using the algorithm GSTN
 * publishes (modulus-36, alternating weights of 1 and 2 over the first
 * 14 characters, mapped through the GSTIN charset).
 */
function computeGstinChecksum(first14: string): string {
  // Left-to-right, position 1 (index 0) gets factor 1, position 2 gets
  // factor 2, alternating — per the published GSTN checksum algorithm.
  let factor = 1;
  let sum = 0;
  const charsetLen = GSTIN_CHARSET.length;

  for (let i = 0; i < first14.length; i++) {
    const codePoint = GSTIN_CHARSET.indexOf(first14[i]);
    const product = factor * codePoint;
    sum += Math.floor(product / charsetLen) + (product % charsetLen);
    factor = factor === 1 ? 2 : 1;
  }

  const checksumIndex = (charsetLen - (sum % charsetLen)) % charsetLen;
  return GSTIN_CHARSET[checksumIndex];
}

/**
 * Validates a GSTIN's format and checksum digit. Does NOT call any
 * external GST portal/API — this is pure offline structural validation,
 * intended to catch typos, not to confirm the GSTIN is actually
 * registered/active (that would require a live GSTN lookup, out of scope
 * here).
 */
export function validateGSTIN(rawValue?: string): GstValidationResult {
  const value = (rawValue || "").trim().toUpperCase();

  if (!value) {
    return { valid: false, reason: "GSTIN is required" };
  }

  if (value.length !== 15) {
    return { valid: false, reason: "GSTIN must be exactly 15 characters" };
  }

  if (!GSTIN_FORMAT_REGEX.test(value)) {
    return {
      valid: false,
      reason:
        "GSTIN format is invalid (expected: 2-digit state code + 10-char PAN + entity number + 'Z' + checksum)",
    };
  }

  const expectedChecksum = computeGstinChecksum(value.slice(0, 14));
  if (expectedChecksum !== value[14]) {
    return { valid: false, reason: "GSTIN checksum digit is incorrect — check for typos" };
  }

  const stateCode = value.slice(0, 2);
  const stateFromCode = getStateNameFromCode(stateCode);

  if (!stateFromCode) {
    return {
      valid: false,
      reason: `Unrecognised GST state code "${stateCode}"`,
    };
  }

  return { valid: true, stateFromCode };
}

/**
 * Convenience helper for forms: validates the GSTIN and, if a state name
 * is also provided (e.g. from a State dropdown), cross-checks that the
 * GSTIN's embedded state code actually matches the selected state —
 * catches the common mistake of pasting a GSTIN registered in a different
 * state than the one selected in the form.
 */
export function validateGSTINAgainstState(
  rawValue: string | undefined,
  selectedState: string | undefined
): GstValidationResult {
  const result = validateGSTIN(rawValue);
  if (!result.valid) return result;

  if (selectedState && result.stateFromCode && result.stateFromCode !== selectedState) {
    return {
      valid: false,
      reason: `This GSTIN is registered in ${result.stateFromCode}, not ${selectedState} — check the GSTIN or the selected state`,
      stateFromCode: result.stateFromCode,
    };
  }

  return result;
}

/** Extracts the 10-character PAN embedded in a (structurally valid) GSTIN. */
export function extractPanFromGSTIN(rawValue?: string): string | null {
  const value = (rawValue || "").trim().toUpperCase();
  if (value.length !== 15) return null;
  return value.slice(2, 12);
}
