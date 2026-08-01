import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement from '@/models/Agreement';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { requirePermission } from '@/middleware/permission.guard';
import { buildPermissionCode } from '@/core/access/actions';
import { logAction } from '@/lib/audit/logAction';
import mongoose from 'mongoose';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/agreements/[id]/expiry { newExpiresAt, reason? }
 *
 * Extends (or sets, if it never had one) an agreement's expiry date. Full
 * admin control over agreement timelines, per explicit direction -- every
 * change is appended to expiryHistory (see models/Agreement.ts) so there's
 * a visible trail of who extended what and when, separate from generically
 * scanning the audit log.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      requirePermission(session as any, buildPermissionCode('agreements', 'edit'));
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { newExpiresAt, reason } = body || {};
    if (!newExpiresAt || Number.isNaN(new Date(newExpiresAt).getTime())) {
      return NextResponse.json({ error: 'newExpiresAt (a valid date) is required' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });

    if (!session.isSuperAdmin && String(agreement.businessId) !== session.business?.businessId) {
      return NextResponse.json({ error: 'You do not have access to this agreement.' }, { status: 403 });
    }

    const previousExpiresAt = agreement.expiresAt;
    agreement.expiresAt = new Date(newExpiresAt);
    agreement.expiryHistory.push({
      action: 'EXTENDED',
      at: new Date(),
      by: session.user.id as any,
      previousExpiresAt,
      newExpiresAt: agreement.expiresAt,
      reason,
    } as any);
    await agreement.save();

    logAction({
      action: 'UPDATE',
      entity: 'Agreement',
      entityId: id,
      after: { expiresAt: agreement.expiresAt, reason },
      req,
      actor: { id: session.user.id, businessId: String(agreement.businessId) },
    });

    return NextResponse.json({ success: true, expiresAt: agreement.expiresAt, expiryHistory: agreement.expiryHistory });
  } catch (error) {
    console.error('PUT /api/agreements/[id]/expiry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
