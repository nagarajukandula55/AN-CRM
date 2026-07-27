import User from "@/models/User";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Every User document must get a non-null `username` (it doubles as the
 * public-facing "user ID" / vendor code — see lib/auth/jwt.ts's SSOPayload
 * comment). The field is `unique + sparse`, but MongoDB's sparse index
 * still indexes an *explicit* null — only a genuinely absent field is
 * skipped — so any two documents saved with username left blank collide
 * on that shared null and throw E11000, which silently breaks the very
 * next signup that also leaves the field blank (register/vendor/employee
 * signup, admin-created users, staff accounts, and auto-created vendor
 * logins all hit this the same way). Call this whenever a creation path
 * has no caller-supplied username to fall back on, instead of ever
 * leaving the field unset/null.
 */
export async function generateUniqueUserId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `an${randomCode(8)}`;
    const exists = await User.exists({ username: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Failed to generate a unique user ID after multiple attempts");
}
