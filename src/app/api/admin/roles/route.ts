import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';
import { logAction } from '@/lib/audit/logAction';
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission, requireAnyPermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { generateDocumentNumber } from "@/core/numbering/numberingService";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      // Also accepts employees.edit -- a Manager granted full Employees
      // access (but not the separate Roles module) still needs to see this
      // business's role list to assign one to their own employees; the
      // list itself carries no sensitive cross-business data since it's
      // already scoped by the businessId query param below.
      requireAnyPermission(session as any, [
        buildPermissionCode("roles", "view"),
        buildPermissionCode("employees", "edit"),
      ]);
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const Role = mongoose.models.Role || (await import('@/models/Role')).default;
    const UserRole = mongoose.models.UserRole || (await import('@/models/UserRole')).default;

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const vendorId = searchParams.get('vendorId');
    // `vendorOnly` used to restrict this query to an exact vendorId match,
    // which meant Admin > Users > Assign to Vendor's role picker could
    // never offer a custom role a Super Admin created for that business
    // from Admin > Access (those are saved with vendorId unset, since
    // they're business-wide, not tied to one specific vendor) -- the
    // literal bug report: "created a role but it's not listed in the
    // dropdown" for a vendor user. There is no UI path that creates a
    // vendor-scoped custom role, so an exact-match-only filter could only
    // ever surface the structural Owner/Manager roles. A vendor's real
    // assignable set is the union of both: its own structural roles AND
    // whatever business-wide roles this business has defined.

    // Roles are no longer auto-generated as a side effect of loading this
    // picker -- a GET request must not create database records. Vendor
    // structural roles (Owner/Manager) are created when a vendor is
    // finalized/approved and self-heal on the vendor's own staff page;
    // if a role is missing here, that's surfaced honestly as an empty
    // picker rather than silently minted.

    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (businessId) query.businessId = businessId;
    if (vendorId) {
      query.$or = [{ vendorId }, { vendorId: { $in: [null, undefined] } }];
    }

    const roles = await Role.find(query).lean();

    const rolesWithCounts = await Promise.all(
      roles.map(async (role: Record<string, unknown>) => {
        const userCount = await UserRole.countDocuments({ roleId: role._id });
        return { ...role, userCount };
      })
    );

    return NextResponse.json({ roles: rolesWithCounts });
  } catch (error) {
    console.error('GET /api/admin/roles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("roles", "create"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const Role = mongoose.models.Role || (await import('@/models/Role')).default;

    const body = await request.json();
    const { name, code, description, permissions, businessId } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
    }
    // Per explicit direction: roles are managed per business individually
    // from now on -- a businessId-less ("platform-wide") custom role is no
    // longer created through this endpoint (SUPER_ADMIN/AN_STAFF remain the
    // only businessId:null roles, both seeded separately, never via this
    // form).
    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required — create this role from within a specific business' }, { status: 400 });
    }

    // Was checking uniqueness GLOBALLY (just `code`), not scoped to this
    // business -- the real unique index is {code, businessId, vendorId}
    // (see Role.ts), so this falsely blocked a second business from ever
    // creating its own role using a code some other business already used
    // (e.g. "MANAGER"), even though roles are meant to be independent per
    // business.
    const existing = await Role.findOne({
      code: code.toUpperCase(),
      businessId: businessId || null,
      vendorId: null,
      isDeleted: { $ne: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'A role with this code already exists for this business' }, { status: 409 });
    }

    // Atomic per-business serial, e.g. "ECOM-0001" -- see
    // scripts/seedRoleNumberConfig.ts for the "{businessCode}-{seq}"
    // template this resolves through.
    const { value: roleNumber } = await generateDocumentNumber(businessId, "ROLE");

    const role = await Role.create({
      name,
      code: code.toUpperCase(),
      description,
      permissions: permissions || [],
      businessId,
      roleNumber,
      isDeleted: false,
    });

    logAction({
      action: "CREATE",
      entity: "Role",
      entityId: role._id?.toString(),
      after: role,
      req: request,
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/roles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("roles", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    await connectDB();
    const Role = mongoose.models.Role || (await import('@/models/Role')).default;

    const body = await request.json();
    const { id, name, description, permissions } = body;

    if (!id) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    const role = await Role.findByIdAndUpdate(
      id,
      { $set: { name, description, permissions } },
      { new: true }
    );

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    logAction({
      action: "UPDATE",
      entity: "Role",
      entityId: id,
      after: { name, description, permissions },
      req: request,
    });

    return NextResponse.json({ role });
  } catch (error) {
    console.error('PUT /api/admin/roles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
