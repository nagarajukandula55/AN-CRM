import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { BusinessService } from "@/services/business.service";
import Business from "@/models/Business";
import BusinessMember from "@/models/BusinessMember";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { notifyUser } from "@/services/notification.service";

export async function GET(req: Request, context: any) {
  try {
    await connectDB();

    const id = context?.params?.id;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Missing business id" },
        { status: 400 }
      );
    }

    const business = await BusinessService.getBusinessById(id);

    if (!business) {
      return NextResponse.json(
        { success: false, message: "Business not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      business,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

// PATCH /api/businesses/[id] — update editable business-profile fields.
// Added to back the new admin Settings hub (src/app/admin/settings)'s
// "Business Profile" tab — this endpoint didn't exist before (only GET
// did). Deliberately allow-lists which fields can be edited here (name/
// legalName/brandName/financial/compliance) rather than accepting an
// arbitrary partial Business document, so this can't be used to smuggle in
// changes to accessCatalog/isActive or other fields that have their own
// dedicated, more carefully-guarded flows elsewhere. "modules" is
// deliberately included below — see the requirement noted next to it.
const EDITABLE_FIELDS = [
  "name",
  "legalName",
  "brandName",
  "businessCode",
  // 2-character short code for quick business mapping and shortened public
  // links (e.g. the customer appointment-request page). See the brandShortcut
  // field comment on models/Business.ts.
  "brandShortcut",
  "financial",
  "compliance",
  // e-Invoice (INV-01) readiness — see models/Business.ts's comment on this
  // field. Added here so it's actually editable through the Settings UI,
  // not just present on the schema with no way to set it.
  "gstStateCode",
  // Whether workorder part selection should check real Inventory stock
  // (serialized) or just pull from the Service Center BOM (not
  // serialized) -- see models/Business.ts's inventorySerialized comment.
  "inventorySerialized",
  // Whether tax/GST is applied when a job sheet closes into a plain B2C
  // bill (no company name on the customer) -- see models/Business.ts's
  // applyTaxOnB2CBilling comment.
  "applyTaxOnB2CBilling",
  // Business Type / Industry enums + address fields — the edit form used
  // to only show city/state/pincode read-only (they were never actually
  // saveable), and type/industry weren't editable post-creation at all.
  "industry",
  "type",
  "address",
  "city",
  "state",
  "pincode",
  // Marketplace dual-invoice configuration — see models/Business.ts's
  // InvoicingRulesSchema comment. Editable here so the Settings UI can
  // actually save it.
  "invoicingRules",
  // Per-business module-access config — which app modules/sections are
  // enabled for this business. See models/Business.ts's ModuleSchema.
  "modules",
  // Branding assets uploaded via the Cloudinary pipeline (api/assets/upload)
  // from the business edit page — surfaced publicly via
  // api/businesses/public for Native's storefront branding.
  "logo",
  "favicon",
  // Per-business mandatory/optional overrides for vendor onboarding
  // documents — see core/vendorCompliance.ts's VENDOR_DOC_CATALOG and the
  // "Vendor Documents" section on this business's edit page.
  "vendorDocumentRequirements",
] as const;

export async function PATCH(req: Request, context: any) {
  try {
    await connectDB();

    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing business id" }, { status: 400 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("businesses", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    // A non-super-admin caller may hold BUSINESSES.EDIT generally but must
    // still be scoped to only the business(es) they're actually a member
    // of — same convention as auth/switch-business/route.ts. Without this,
    // any user with edit rights on their own business could PATCH any
    // other business by guessing/enumerating ids.
    if (!session.isSuperAdmin) {
      const membership = await BusinessMember.findOne({
        userId: session.user.id,
        businessId: id,
        status: "ACTIVE",
      }).lean();
      if (!membership) {
        return NextResponse.json(
          { success: false, message: "You do not have access to this business" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: "No editable fields provided" }, { status: 400 });
    }

    // Server-side GSTIN re-validation, mirroring the create-route check —
    // compliance.gstNumber can arrive here via PATCH just as easily as via
    // POST /api/businesses/create, so the same guarantee has to apply.
    const gstNumber = (updates.compliance as any)?.gstNumber;
    if (gstNumber && String(gstNumber).trim()) {
      const stateForCheck =
        (updates.state as string | undefined) ??
        (await Business.findById(id).select("state").lean().then((b: any) => b?.state));
      const gstResult = validateGSTINAgainstState(gstNumber, stateForCheck);
      if (!gstResult.valid) {
        return NextResponse.json(
          { success: false, message: gstResult.reason || "Invalid GSTIN" },
          { status: 400 }
        );
      }
    }

    if (updates.pincode && !/^[1-9][0-9]{5}$/.test(String(updates.pincode).trim())) {
      return NextResponse.json(
        { success: false, message: "Pincode must be a valid 6-digit Indian PIN code" },
        { status: 400 }
      );
    }

    const business = await Business.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Business",
      entityId: id,
      after: updates,
      req,
    });

    return NextResponse.json({ success: true, business });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

// DELETE /api/businesses/[id] — soft-delete a business (isActive: false),
// same convention BusinessService.listBusinesses() / /api/businesses/list
// already use to filter what shows up as "active" — consistent with how
// PATCH above treats isActive, and avoids destroying historical data
// (orders/invoices/etc.) tied to this businessId. Super-admin only: unlike
// PATCH there's no non-super-admin path here, since deleting a business is
// not something a regular business-scoped edit permission should ever grant.
export async function DELETE(req: Request, context: any) {
  try {
    await connectDB();

    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing business id" }, { status: 400 });
    }

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only Super Admins can delete a business" },
        { status: 403 }
      );
    }

    const business = await Business.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    ).lean();
    if (!business) {
      return NextResponse.json({ success: false, message: "Business not found" }, { status: 404 });
    }

    logAction({
      action: "DELETE",
      entity: "Business",
      entityId: id,
      after: { isActive: false },
      req,
      actor: { id: session.user.id },
    });

    notifyUser({
      userId: session.user.id,
      title: "Business deleted",
      message: `"${(business as any).name}" was deleted.`,
      type: "warning",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
