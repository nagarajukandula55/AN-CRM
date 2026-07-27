import Role, { IRole, RoleType, RoleStatus } from "@/models/Role";
import RolePermission from "@/models/RolePermission";
import Permission from "@/models/Permission";
import { Types } from "mongoose";

/* =========================================================
 * ROLE SERVICE
 * =======================================================*/

export class RoleService {
  /**
   * Create a new role
   */
  static async createRole(data: {
    organizationId: string;
    businessId?: string;
    name: string;
    code: string;
    description?: string;
    createdBy?: string;
    isDefault?: boolean;
    isProtected?: boolean;
  }): Promise<IRole> {
    const role = await Role.create({
      organizationId: new Types.ObjectId(data.organizationId),
      businessId: data.businessId
        ? new Types.ObjectId(data.businessId)
        : undefined,
      name: data.name,
      code: data.code,
      description: data.description,
      type: RoleType.CUSTOM,
      status: RoleStatus.ACTIVE,
      isDefault: data.isDefault ?? false,
      isProtected: data.isProtected ?? false,
      createdBy: data.createdBy
        ? new Types.ObjectId(data.createdBy)
        : undefined,
    });

    return role;
  }

  /**
   * Get role by ID
   */
  static async getRoleById(roleId: string) {
    return Role.findById(roleId);
  }

  /**
   * Get roles for organization/business
   */
  static async getRoles(params: {
    organizationId: string;
    businessId?: string;
  }) {
    return Role.find({
      organizationId: params.organizationId,
      businessId: params.businessId || null,
      status: RoleStatus.ACTIVE,
    }).sort({ createdAt: -1 });
  }

  /**
   * Update role details
   */
  static async updateRole(
    roleId: string,
    data: Partial<IRole>
  ) {
    return Role.findByIdAndUpdate(roleId, data, {
      new: true,
    });
  }

  /**
   * Delete role (soft safety check)
   */
  static async deleteRole(roleId: string) {
    return Role.findByIdAndUpdate(roleId, {
      status: RoleStatus.INACTIVE,
    });
  }

  /**
   * Assign permissions to role
   */
  static async assignPermissions(data: {
    roleId: string;
    permissionIds: string[];
    createdBy?: string;
  }) {
    const operations = data.permissionIds.map((pid) => ({
      updateOne: {
        filter: {
          roleId: new Types.ObjectId(data.roleId),
          permissionId: new Types.ObjectId(pid),
        },
        update: {
          $setOnInsert: {
            roleId: new Types.ObjectId(data.roleId),
            permissionId: new Types.ObjectId(pid),
            createdBy: data.createdBy
              ? new Types.ObjectId(data.createdBy)
              : undefined,
          },
        },
        upsert: true,
      },
    }));

    return RolePermission.bulkWrite(operations);
  }

  /**
   * Remove permission from role
   */
  static async removePermission(
    roleId: string,
    permissionId: string
  ) {
    return RolePermission.deleteOne({
      roleId: new Types.ObjectId(roleId),
      permissionId: new Types.ObjectId(permissionId),
    });
  }

  /**
   * Get permissions of a role
   */
  static async getRolePermissions(roleId: string) {
    const mappings = await RolePermission.find({
      roleId: new Types.ObjectId(roleId),
    });

    const permissionIds = mappings.map(
      (m) => m.permissionId
    );

    return Permission.find({
      _id: { $in: permissionIds },
    });
  }
}
