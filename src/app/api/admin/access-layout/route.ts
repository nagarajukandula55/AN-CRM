import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import {
  getEffectiveAccessHierarchy,
  createCategory,
  renameCategory,
  deleteCategory,
  moveModule,
} from "@/core/access/accessLayout.service";

function permissionErrorResponse(err: any) {
  return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
}

async function guard() {
  const session = await getEnrichedSession();
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    requirePermission(session as any, buildPermissionCode("roles", "edit"));
  } catch (err: any) {
    return { error: permissionErrorResponse(err) };
  }
  return { session };
}

/** ?businessId=... -- omit (or pass "AN_GROUP") for AN Group's own layout. */
export async function GET(req: NextRequest) {
  const { error } = await guard();
  if (error) return error;
  await connectDB();
  const businessIdParam = req.nextUrl.searchParams.get("businessId");
  const businessId = businessIdParam && businessIdParam !== "AN_GROUP" ? businessIdParam : null;
  const hierarchy = await getEffectiveAccessHierarchy(businessId);
  return NextResponse.json({ success: true, hierarchy });
}

/** body: { action: 'addCategory'|'addSubcategory'|'rename'|'delete'|'moveModule', businessId?, ... } */
export async function POST(req: NextRequest) {
  const { error } = await guard();
  if (error) return error;
  await connectDB();

  const body = await req.json().catch(() => ({}));
  const { action } = body;
  const businessId = body.businessId && body.businessId !== "AN_GROUP" ? body.businessId : null;

  try {
    if (action === "addCategory") {
      if (!body.label?.trim()) return NextResponse.json({ error: "label is required" }, { status: 400 });
      const node = await createCategory(body.label.trim(), "", businessId);
      return NextResponse.json({ success: true, node });
    }
    if (action === "addSubcategory") {
      if (!body.label?.trim() || !body.parentKey) {
        return NextResponse.json({ error: "label and parentKey are required" }, { status: 400 });
      }
      const node = await createCategory(body.label.trim(), body.parentKey, businessId);
      return NextResponse.json({ success: true, node });
    }
    if (action === "rename") {
      if (!body.key || !body.label?.trim()) {
        return NextResponse.json({ error: "key and label are required" }, { status: 400 });
      }
      await renameCategory(body.key, body.label.trim(), businessId);
      return NextResponse.json({ success: true });
    }
    if (action === "delete") {
      if (!body.key) return NextResponse.json({ error: "key is required" }, { status: 400 });
      await deleteCategory(body.key, businessId);
      return NextResponse.json({ success: true });
    }
    if (action === "moveModule") {
      if (!body.moduleKey || !body.parentKey) {
        return NextResponse.json({ error: "moduleKey and parentKey are required" }, { status: 400 });
      }
      await moveModule(body.moduleKey, body.parentKey, businessId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
