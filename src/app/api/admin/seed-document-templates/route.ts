/**
 * POST/GET /api/admin/seed-document-templates
 * Seeds the "2-3 designs per document type" starter templates (see
 * core/documentTemplates/seedVariety.ts) into every business, using the
 * running app's own DB connection -- no local .env.local/MONGODB_URI
 * needed, unlike the equivalent CLI script. Insert-only/idempotent, safe
 * to run repeatedly. Only callable by super-admins.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { seedDocumentTemplateVariety } from "@/core/documentTemplates/seedVariety";

async function run() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  const userId = h.get("x-user-id");

  if (!userId || !isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();
  const results = await seedDocumentTemplateVariety();

  return NextResponse.json({
    success: true,
    message: `Seeded document templates for ${results.length} business(es)`,
    results,
  });
}

export async function POST() {
  return run();
}

/** GET — for quick browser-based trigger */
export async function GET() {
  return run();
}
