import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import EmployeeProfile from "@/models/EmployeeProfile";
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
// Required for .populate(...) below -- model must be registered before populate can resolve it.
import "@/models/User";

function permissionErrorResponse(err: any) {
  return NextResponse.json(
    { success: false, error: err.message },
    { status: err.code === "FORBIDDEN" ? 403 : 401 }
  );
}

// Was entirely ungated (all three handlers below) -- any authenticated user
// of any role could view/edit/delete any employee's profile, salary
// included. Same requirePermission pattern as api/employees/route.ts.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("employees", "view"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await context.params;
    await connectDB();

    const employee = await EmployeeProfile.findById(id)
      .populate("userId", "name email phone avatar")
      .lean();

    if (!employee) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true, employee });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("employees", "edit"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await context.params;
    await connectDB();

    const body = await req.json();
    const {
      department,
      designation,
      employmentType,
      joiningDate,
      salary,
      status,
      emergencyContact,
    } = body;

    const update: any = {};
    if (department !== undefined) update.department = department;
    if (designation !== undefined) update.designation = designation;
    if (employmentType !== undefined) update.employmentType = employmentType;
    if (joiningDate !== undefined) update.joiningDate = joiningDate ? new Date(joiningDate) : undefined;
    if (salary !== undefined) update.salary = salary ? Number(salary) : undefined;
    if (status !== undefined) update.status = status;
    if (emergencyContact !== undefined) update.emergencyContact = emergencyContact;

    const employee = await EmployeeProfile.findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate("userId", "name email phone avatar")
      .lean();

    if (!employee) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    logAction({
      action: "UPDATE",
      entity: "EmployeeProfile",
      entityId: id,
      after: update,
      req,
    });

    return NextResponse.json({ success: true, employee });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode("employees", "delete"));
    } catch (err: any) {
      return permissionErrorResponse(err);
    }

    const { id } = await context.params;
    await connectDB();

    await EmployeeProfile.findByIdAndUpdate(id, { isDeleted: true });

    logAction({
      action: "DELETE",
      entity: "EmployeeProfile",
      entityId: id,
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
