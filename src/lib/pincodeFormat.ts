/**
 * Pure pincode format validation — no dataset dependency, safe to import
 * from both client components and server routes. The actual lookup is
 * server-side via /api/pincode/[pincode], backed by central-api's shared
 * "pincode" dataset.
 */
export function isValidPincodeFormat(pin?: string): boolean {
  return !!pin && /^[1-9][0-9]{5}$/.test(pin.trim());
}
