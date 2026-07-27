/**
 * POST /api/admin/seed-modules
 * Seeds missing navigation modules into all Business documents.
 * Safe to run multiple times (uses $addToSet / upsert logic).
 * Only callable by super-admins (x-is-super-admin: true header).
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Business from "@/models/Business";

const NEW_MODULES = [
  // ── Core ERP ──────────────────────────────────────────────
  { key: "dashboard", label: "Dashboard", route: "/dashboard", icon: "LayoutDashboard", enabled: true },
  { key: "inventory", label: "Inventory", route: "/inventory", icon: "Package", enabled: true },
  { key: "purchase", label: "Purchase", route: "/purchase", icon: "ShoppingCart", enabled: true },
  { key: "sales", label: "Sales", route: "/sales", icon: "TrendingUp", enabled: true },
  { key: "finance", label: "Finance", route: "/finance", icon: "DollarSign", enabled: true },
  { key: "crm", label: "CRM", route: "/crm", icon: "Users", enabled: true },
  { key: "hr", label: "HR", route: "/hr", icon: "UserCheck", enabled: true },
  // ── NEW: Agreements ───────────────────────────────────────
  { key: "agreements", label: "Agreements", route: "/agreements", icon: "FileSignature", enabled: true },
  // ── NEW: Zenforge (content generation + posting moved to the
  // separate Zenforge project; this key is kept unchanged so businesses
  // that already have "social" saved in Business.modules[] don't lose
  // the module, see sidebar.tsx's matching comment) ──────────
  { key: "social", label: "Zenforge", route: "/admin/zenforge", icon: "Share2", enabled: true },
  // ── NEW: AI Studio ────────────────────────────────────────
  { key: "ai-image", label: "AI Studio", route: "/ai-image", icon: "Sparkles", enabled: true },
  // ── Admin ─────────────────────────────────────────────────
  { key: "admin-integrations", label: "Integrations", route: "/admin/integrations", icon: "Plug", enabled: true },
  { key: "admin-roles", label: "Roles & Permissions", route: "/admin/roles", icon: "Shield", enabled: true },
  { key: "notifications", label: "Notifications", route: "/notifications", icon: "Bell", enabled: true },
  { key: "chat", label: "Team Chat", route: "/chat", icon: "MessageSquare", enabled: true },
];

export async function POST() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";
  const userId = h.get("x-user-id");

  if (!userId || !isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();

  const businesses = await Business.find({}).lean();
  const results: { businessId: string; added: string[] }[] = [];

  for (const biz of businesses as any[]) {
    const existingKeys = new Set((biz.modules || []).map((m: any) => m.key));
    const toAdd = NEW_MODULES.filter((m) => !existingKeys.has(m.key));

    if (toAdd.length > 0) {
      await Business.updateOne(
        { _id: biz._id },
        { $push: { modules: { $each: toAdd } } }
      );
      results.push({ businessId: biz._id.toString(), added: toAdd.map((m) => m.key) });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Seeded modules for ${results.length} businesses`,
    results,
  });
}

/**
 * GET — for quick browser-based trigger during dev
 */
export async function GET() {
  const h = await headers();
  const isSuperAdmin = h.get("x-is-super-admin") === "true";

  if (!isSuperAdmin) {
    return NextResponse.json({ success: false, message: "Super admin only" }, { status: 403 });
  }

  await connectDB();

  const businesses = await Business.find({}).lean();
  const results: { businessId: string; added: string[] }[] = [];

  for (const biz of businesses as any[]) {
    const existingKeys = new Set((biz.modules || []).map((m: any) => m.key));
    const toAdd = NEW_MODULES.filter((m) => !existingKeys.has(m.key));

    if (toAdd.length > 0) {
      await Business.updateOne(
        { _id: biz._id },
        { $push: { modules: { $each: toAdd } } }
      );
      results.push({ businessId: biz._id.toString(), added: toAdd.map((m) => m.key) });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Seeded modules for ${results.length} businesses`,
    results,
  });
}
