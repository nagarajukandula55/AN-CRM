/**
 * ONE-OFF LOOKUP: prints every SUPER_ADMIN user's real email/username, so
 * you know exactly what to register in central-api (POST /api/auth/register
 * needs the SAME email the local User document actually has -- not
 * whatever username you type into the login form).
 *
 *   npx tsx --env-file=.env.local scripts/whoIsSuperAdmin.ts
 */
import { connectDB } from "../src/lib/mongodb";
import User from "../src/models/User";

async function main() {
  await connectDB();
  const admins = await User.find({ role: "SUPER_ADMIN" }).select("email username name isActive").lean();
  if (admins.length === 0) {
    console.log("No SUPER_ADMIN users found.");
  } else {
    admins.forEach((a: any) => {
      console.log(`email: ${a.email}   username: ${a.username || "(none)"}   name: ${a.name}   active: ${a.isActive}`);
    });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
