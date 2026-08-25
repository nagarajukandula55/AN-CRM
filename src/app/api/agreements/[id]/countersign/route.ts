import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { ISignature, IParty } from '@/models/Agreement';
import { getEnrichedSession } from '@/lib/auth/session-enriched';
import { logAction } from '@/lib/audit/logAction';
import { sendGenericEmail } from '@/services/email/resend.service';
import { renderEmailShell } from '@/services/email/emailShell';
import { activateVendorAfterAgreement } from '@/services/vendorActivation.service';
import mongoose from 'mongoose';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agreements/[id]/countersign
 *
 * The Super Admin/Owner's own final signature step -- deliberately NOT the
 * same OTP-over-email flow the vendor uses (api/agreements/[id]/sign):
 * the Super Admin is already authenticated in-app, so this just records
 * their signature directly against the "Company" party the instant they
 * click Sign, no email round-trip needed. Per explicit direction: this is
 * meant to be the FINAL gate -- the moment it completes the agreement
 * (both parties signed), it automatically fires the same activation this
 * app already does at api/vendors/[id]/finalize (create login,
 * BusinessMember, credentials email), so nothing further is needed from
 * the admin.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only a Super Admin/Owner can countersign the company side of an agreement.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const signatureData: string | undefined = body?.signatureData;
    if (!signatureData) {
      return NextResponse.json({ error: 'signatureData is required' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (!['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(agreement.status)) {
      return NextResponse.json({ error: 'Agreement is not in a signable state' }, { status: 400 });
    }

    const companyParty = agreement.parties.find((p: IParty) => p.role === 'Company');
    if (!companyParty) {
      return NextResponse.json({ error: 'This agreement has no "Company" party to countersign.' }, { status: 400 });
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    let sigIndex = agreement.signatures.findIndex((s: ISignature) => s.partyRole === 'Company');
    if (sigIndex === -1) {
      // The company party never got an OTP-based signature row (it isn't
      // sent by email -- see the top comment) -- create it now, signed.
      agreement.signatures.push({
        partyEmail: companyParty.email || session.user.email,
        partyName: companyParty.name,
        partyRole: 'Company',
        otpVerified: true,
        signedAt: new Date(),
        signatureData,
        ipAddress,
      } as ISignature);
    } else {
      if (agreement.signatures[sigIndex].signedAt) {
        return NextResponse.json({ error: 'The company side has already signed this agreement.' }, { status: 400 });
      }
      agreement.signatures[sigIndex].signedAt = new Date();
      agreement.signatures[sigIndex].signatureData = signatureData;
      agreement.signatures[sigIndex].ipAddress = ipAddress;
      agreement.signatures[sigIndex].otpVerified = true;
    }

    const allSigned = agreement.signatures.every((s: ISignature) => s.signedAt) && agreement.signatures.length >= agreement.parties.length;
    agreement.status = allSigned ? 'FULLY_SIGNED' : 'PARTIALLY_SIGNED';
    await agreement.save();

    logAction({
      action: 'SIGN',
      entity: 'Agreement',
      entityId: id,
      after: { partyRole: 'Company', status: agreement.status },
      req,
      actor: { id: session.user.id },
    });

    let activation: Awaited<ReturnType<typeof activateVendorAfterAgreement>> | null = null;

    if (allSigned) {
      const vendorParty = agreement.parties.find((p: IParty) => p.role === 'Vendor');
      if (vendorParty?.email) {
        sendGenericEmail({
          to: vendorParty.email,
          subject: `Your agreement "${agreement.title}" has been fully executed`,
          html: renderEmailShell({
            heading: "Your agreement is fully executed",
            previewText: `"${agreement.title}" has been signed by both parties.`,
            bodyHtml: `
              <p>Hi ${vendorParty.name || ''},</p>
              <p>Good news — your agreement <strong>${agreement.title}</strong> has now been signed by both parties and is fully executed.</p>
              <p style="font-size:13px;color:#8B8F94;">You'll receive a separate email shortly with your login details.</p>
            `,
          }),
          businessId: (agreement as any).businessId?.toString(),
          templateKey: "AGREEMENT_FULLY_EXECUTED",
          templateTokens: { partyName: vendorParty.name || '', agreementTitle: agreement.title },
        }).catch(() => {});
      }

      // Auto-activate the linked vendor the moment the final signature
      // lands -- see services/vendorActivation.service.ts. Best-effort: a
      // failure here doesn't undo the countersign itself (an admin can
      // always retry via the manual /finalize route), just means the
      // credentials email/login creation didn't fire automatically.
      const VendorProfile = (await import('@/models/VendorProfile')).default;
      const vendor = await VendorProfile.findOne({ agreementId: agreement._id });
      if (vendor) {
        activation = await activateVendorAfterAgreement(vendor._id.toString(), session.user.id).catch((err) => {
          console.error('Auto-activation after countersign failed:', err);
          return null;
        });
      }
    }

    const updated = await Agreement.findById(id).select('-signatures.otp').lean();

    return NextResponse.json({
      message: allSigned ? 'Agreement fully signed — vendor activated and notified.' : 'Company signature recorded.',
      agreement: updated,
      fullySigned: allSigned,
      activation: activation && activation.ok ? { vendorActivated: true } : undefined,
    });
  } catch (error) {
    console.error('POST /api/agreements/[id]/countersign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
