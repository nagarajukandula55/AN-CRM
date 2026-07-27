import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';

const PERMISSION_MODULES = {
  Inventory: [
    { code: 'inventory.view', name: 'View Inventory', description: 'View inventory items and stock levels' },
    { code: 'inventory.create', name: 'Create Items', description: 'Add new inventory items' },
    { code: 'inventory.edit', name: 'Edit Items', description: 'Modify existing inventory items' },
    { code: 'inventory.delete', name: 'Delete Items', description: 'Remove inventory items' },
    { code: 'inventory.adjust', name: 'Adjust Stock', description: 'Manually adjust stock quantities' },
  ],
  Sales: [
    { code: 'sales.view', name: 'View Sales', description: 'View sales orders and history' },
    { code: 'sales.create', name: 'Create Orders', description: 'Create new sales orders' },
    { code: 'sales.edit', name: 'Edit Orders', description: 'Modify existing sales orders' },
    { code: 'sales.delete', name: 'Delete Orders', description: 'Cancel or delete sales orders' },
    { code: 'sales.approve', name: 'Approve Orders', description: 'Approve pending sales orders' },
  ],
  Purchase: [
    { code: 'purchase.view', name: 'View Purchases', description: 'View purchase orders' },
    { code: 'purchase.create', name: 'Create POs', description: 'Create new purchase orders' },
    { code: 'purchase.edit', name: 'Edit POs', description: 'Modify purchase orders' },
    { code: 'purchase.approve', name: 'Approve POs', description: 'Approve purchase orders' },
  ],
  Finance: [
    { code: 'finance.view', name: 'View Finance', description: 'View financial records' },
    { code: 'finance.create', name: 'Create Transactions', description: 'Create financial transactions' },
    { code: 'finance.approve', name: 'Approve Payments', description: 'Approve payment transactions' },
    { code: 'finance.reports', name: 'Financial Reports', description: 'Access financial reports' },
  ],
  HR: [
    { code: 'hr.view', name: 'View HR', description: 'View HR records and employee data' },
    { code: 'hr.manage', name: 'Manage Employees', description: 'Add, edit, remove employees' },
    { code: 'hr.payroll', name: 'Manage Payroll', description: 'Process payroll' },
    { code: 'hr.leaves', name: 'Manage Leaves', description: 'Approve or reject leave requests' },
  ],
  CRM: [
    { code: 'crm.view', name: 'View CRM', description: 'View customer and contact records' },
    { code: 'crm.create', name: 'Create Contacts', description: 'Add new CRM contacts' },
    { code: 'crm.edit', name: 'Edit Contacts', description: 'Modify CRM contacts' },
    { code: 'crm.delete', name: 'Delete Contacts', description: 'Remove CRM contacts' },
  ],
  Admin: [
    { code: 'admin.users', name: 'Manage Users', description: 'Create and manage users' },
    { code: 'admin.roles', name: 'Manage Roles', description: 'Create and manage roles' },
    { code: 'admin.settings', name: 'System Settings', description: 'Configure system settings' },
    { code: 'admin.businesses', name: 'Manage Businesses', description: 'Manage business entities' },
  ],
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const Role = mongoose.models.Role || (await import('@/models/Role')).default;
    const UserRole = mongoose.models.UserRole || (await import('@/models/UserRole')).default;

    const roles = await Role.find({ isDeleted: { $ne: true } }).lean();

    const rolesWithCounts = await Promise.all(
      roles.map(async (role: Record<string, unknown>) => {
        const userCount = await UserRole.countDocuments({ roleId: role._id });
        return { ...role, userCount };
      })
    );

    return NextResponse.json({
      roles: rolesWithCounts,
      permissionModules: PERMISSION_MODULES,
    });
  } catch (error) {
    console.error('GET /api/admin/access error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
