/**
 * Pure pincode format validation — no dataset dependency, safe to import
 * from both client components and server routes. Split out from the old
 * pincodeLookup.ts (which bundled the full ~1.4MB static JSON dataset)
 * once the actual lookup moved server-side to MongoDB via
 * /api/pincode/[pincode] — see PincodeEntry.ts's comment for why.
 */
export function isValidPincodeFormat(pin?: string): boolean {
  return !!pin && /^[1-9][0-9]{5}$/.test(pin.trim());
}
