import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { ISignature } from '@/models/Agreement';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { requirePermission } from '@/middleware/permission.guard';
import { buildPermissionCode } from '@/core/access/actions';
import { logAction } from '@/lib/audit/logAction';
import mongoose from 'mongoose';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agreements/[id]/reinstate { newExpiresAt?, reason? }
 *
 * Brings an EXPIRED, CANCELLED, or DECLINED agreement back to life. Per
 * explicit direction: full control over the expiry lifecycle includes
 * being able to reinstate, not just extend before expiry happens.
 * Resets it to DRAFT and clears every prior signature/OTP -- a lapsed
 * agreement needs to be signed again from scratch (a stale signature from
 * before expiry shouldn't count as consent to a reinstated one), which is
 * also why party-email/route.ts points here as the fix when a signed
 * party's email needs correcting.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const agreement = await Agreement.findById(id);
    if (!agreement) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });

    if (!session.isSuperAdmin && String(agreement.businessId) !== session.business?.businessId) {
      return NextResponse.json({ error: 'You do not have access to this agreement.' }, { status: 403 });
    }

    if (!['EXPIRED', 'CANCELLED', 'DECLINED'].includes(agreement.status)) {
      return NextResponse.json(
        { error: `Only an EXPIRED, CANCELLED, or DECLINED agreement can be reinstated (this one is ${agreement.status}).` },
        { status: 400 }
      );
    }

    const previousStatus = agreement.status;

    agreement.signatures = agreement.signatures.map((s: ISignature) => ({
      partyEmail: s.partyEmail,
      partyName: s.partyName,
      partyRole: s.partyRole,
      otpVerified: false,
    })) as any;
    agreement.status = 'DRAFT';
    if (newExpiresAt && !Number.isNaN(new Date(newExpiresAt).getTime())) {
      agreement.expiresAt = new Date(newExpiresAt);
    }
    agreement.expiryHistory.push({
      action: 'REINSTATED',
      at: new Date(),
      by: session.user.id as any,
      previousStatus,
      newExpiresAt: agreement.expiresAt,
      reason,
    } as any);
    await agreement.save();

    logAction({
      action: 'UPDATE',
      entity: 'Agreement',
      entityId: id,
      after: { reinstated: true, from: previousStatus, expiresAt: agreement.expiresAt, reason },
      req,
      actor: { id: session.user.id, businessId: String(agreement.businessId) },
    });

    return NextResponse.json({
      success: true,
      message: 'Agreement reinstated to DRAFT with all prior signatures cleared — send it again to restart signing.',
      agreement: { _id: agreement._id, status: agreement.status, expiresAt: agreement.expiresAt },
    });
  } catch (error) {
    console.error('POST /api/agreements/[id]/reinstate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
