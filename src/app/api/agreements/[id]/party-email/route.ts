import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { IParty, ISignature } from '@/models/Agreement';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { requirePermission } from '@/middleware/permission.guard';
import { buildPermissionCode } from '@/core/access/actions';
import { logAction } from '@/lib/audit/logAction';
import mongoose from 'mongoose';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/agreements/[id]/party-email { oldEmail, newEmail }
 *
 * Changes a signer's email on file -- e.g. the vendor gave a wrong/dead
 * address and the OTP never arrived. Full admin control per explicit
 * direction. Only allowed while that party HASN'T signed yet (a signed
 * signature is tied to the email it was verified against -- changing it
 * after the fact would misrepresent who actually signed); if they've
 * already signed, reinstate the agreement first (see .../reinstate),
 * which clears prior signatures for exactly this kind of correction.
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
    const { oldEmail, newEmail } = body || {};
    if (!oldEmail || !newEmail) {
      return NextResponse.json({ error: 'oldEmail and newEmail are required' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });

    if (!session.isSuperAdmin && String(agreement.businessId) !== session.business?.businessId) {
      return NextResponse.json({ error: 'You do not have access to this agreement.' }, { status: 403 });
    }

    const party = agreement.parties.find((p: IParty) => p.email === oldEmail);
    if (!party) {
      return NextResponse.json({ error: `No party found with email ${oldEmail}` }, { status: 404 });
    }

    const sig = agreement.signatures.find((s: ISignature) => s.partyEmail === oldEmail);
    if (sig?.signedAt) {
      return NextResponse.json(
        { error: 'This party has already signed — reinstate the agreement first to correct their email.' },
        { status: 400 }
      );
    }

    party.email = newEmail;
    if (sig) {
      sig.partyEmail = newEmail;
      // Any outstanding OTP was hashed and sent to the OLD address --
      // invalidate it so a stale email can't still be used to sign.
      sig.otp = undefined;
      sig.otpExpiry = undefined;
    }
    await agreement.save();

    logAction({
      action: 'UPDATE',
      entity: 'Agreement',
      entityId: id,
      after: { partyEmailChanged: { from: oldEmail, to: newEmail } },
      req,
      actor: { id: session.user.id, businessId: String(agreement.businessId) },
    });

    return NextResponse.json({
      success: true,
      message: 'Email updated. Re-send the agreement (or request a new OTP) to deliver a signing link to the new address.',
      party: { name: party.name, email: party.email, role: party.role },
    });
  } catch (error) {
    console.error('PUT /api/agreements/[id]/party-email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
