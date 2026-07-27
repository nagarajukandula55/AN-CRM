import User from "@/models/User";
import BusinessMember from "@/models/BusinessMember";
import UserRole from "@/models/UserRole";
import Role from "@/models/Role";
import { Types } from "mongoose";

export class UserService {
  static async createUser(data: {
    name: string;
    email: string;
    password: string;
    organizationId: string;
    businessId: string;
    roleCode: string;
    createdBy?: string;
  }) {
    const existing = await User.findOne({ email: data.email });
    if (existing) throw new Error("User already exists");

    const user = await User.create({
      name: data.name,
      email: data.email,
      password: data.password,
      isActive: true,
      isEmailVerified: false,
      role: "CUSTOMER",
      mustChangePassword: true,
    });

    const member = await BusinessMember.create({
      organizationId: new Types.ObjectId(data.organizationId),
      businessId: new Types.ObjectId(data.businessId),
      userId: user._id,
      memberType: "EMPLOYEE",
      status: "ACTIVE",
      isDefaultBusiness: true,
      invitedBy: data.createdBy ? new Types.ObjectId(data.createdBy) : null,
    });

    const role = await Role.findOne({ code: data.roleCode, organizationId: data.organizationId });
    if (!role) throw new Error("Role not found");

    await UserRole.create({
      userId: user._id,
      roleId: role._id,
      businessMemberId: member._id,
      assignedBy: data.createdBy ? new Types.ObjectId(data.createdBy) : null,
      isActive: true,
    });

    return { user, businessMember: member, role };
  }

  static async getUserByEmail(email: string) {
    return User.findOne({ email, isDeleted: false });
  }

  static async getUserContext(userId: string) {
    const user = await User.findById(userId);
    if (!user) return null;
    const memberships = await BusinessMember.find({ userId: user._id });
    const userRoles = await UserRole.find({ userId: user._id, isActive: true });
    const roleIds = userRoles.map((r) => r.roleId);
    const roles = await Role.find({ _id: { $in: roleIds } });
    return { user, memberships, roles };
  }

  static async assignRole(data: {
    userId: string;
    roleId: string;
    // Real UserRole schema field (models/UserRole.ts) -- previously this
    // accepted/wrote a "businessMemberId" that isn't a field on the
    // schema at all (Mongoose silently drops unknown paths), so it never
    // actually did anything even on the rare call that reached this far.
    businessId?: string;
    assignedBy?: string;
  }) {
    // Upsert instead of a bare create: UserRole has a unique
    // {userId, roleId} index, so re-assigning the same role (e.g. the
    // admin double-clicks, or the role was already granted once before)
    // would otherwise throw a duplicate-key error instead of just
    // confirming the grant.
    const assigned = await UserRole.findOneAndUpdate(
      { userId: new Types.ObjectId(data.userId), roleId: new Types.ObjectId(data.roleId) },
      {
        $set: {
          businessId: data.businessId ? new Types.ObjectId(data.businessId) : null,
          assignedBy: data.assignedBy ? new Types.ObjectId(data.assignedBy) : null,
        },
      },
      { upsert: true, new: true }
    );

    // Every self-registered account gets a default CUSTOMER UserRole at
    // signup (see api/admin/users/route.ts's create path). assignRole is
    // purely additive, so promoting that same person to a real staff/
    // vendor role left BOTH UserRole grants in place -- the user list then
    // showed "Customer" alongside (or instead of, depending on sort order)
    // the role that was actually just assigned, which read as if the
    // assignment hadn't taken effect. Retiring the stale CUSTOMER grant
    // here is safe: a customer's ability to see their OWN orders is keyed
    // off their identity (userId/email), never off holding a CUSTOMER
    // Role/permission, so removing it doesn't touch their order access at
    // all -- it only stops "Customer" from cluttering the role display
    // once they've been given a real role.
    const assignedRole = await Role.findById(data.roleId).select("code businessId vendorId name").lean();

    // A vendor-scoped role (VENDOR_OWNER/VENDOR_MANAGER/any custom vendor
    // role) grants the RIGHT permissions via UserRole above, but every
    // /vendor/* page and API (see lib/auth/vendorContext.ts,
    // vendorAccess.service.ts's resolveOwnerOrManagerVendor) additionally
    // requires an ACTIVE BusinessMember row with that vendorId before it'll
    // recognize the person as vendor staff at all -- assigning the role
    // from here (Admin > Employees / Admin > Users, as opposed to the
    // vendor's own self-service Team & Access flow, which always creates
    // this row alongside the role) previously left that row missing
    // entirely. The person held the role but was 404'd by every vendor
    // API and redirected straight back to /login by vendor/layout.tsx the
    // moment they tried to open the portal -- reproduced and confirmed
    // against production before this fix. Upserting it here closes that
    // gap for every admin-side role-assignment surface at once.
    if (assignedRole && (assignedRole as any).vendorId) {
      const r = assignedRole as any;
      await BusinessMember.findOneAndUpdate(
        { userId: new Types.ObjectId(data.userId), businessId: r.businessId, vendorId: r.vendorId },
        {
          $set: { status: "ACTIVE", isDeleted: false, vendorRole: r.name },
          $setOnInsert: {
            userId: new Types.ObjectId(data.userId),
            businessId: r.businessId,
            vendorId: r.vendorId,
            memberType: "VENDOR",
            isDefaultBusiness: false,
            joinedAt: new Date(),
            invitedBy: data.assignedBy ? new Types.ObjectId(data.assignedBy) : null,
          },
        },
        { upsert: true }
      );
    }

    if (assignedRole && (assignedRole as any).code !== "CUSTOMER") {
      // code is NOT globally unique (scoped per {code, businessId, vendorId}
      // -- see Role.ts), so this must collect every CUSTOMER Role doc, not
      // just one, to actually catch whichever one this user was granted.
      const customerRoleIds = await Role.find({ code: "CUSTOMER" }).select("_id").lean();
      if (customerRoleIds.length > 0) {
        await UserRole.deleteMany({
          userId: new Types.ObjectId(data.userId),
          roleId: { $in: customerRoleIds.map((r: any) => r._id) },
        });
      }
    }

    return assigned;
  }
}

export default UserService;
