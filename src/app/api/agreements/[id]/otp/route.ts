import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { ISignature } from '@/models/Agreement';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { sendAgreementOtpEmail } from "@/services/email/resend.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("agreements", "edit"));
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const body = await req.json();
    const { partyEmail } = body;

    if (!partyEmail) {
      return NextResponse.json({ error: 'partyEmail is required' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (!['PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'DRAFT'].includes(agreement.status)) {
      return NextResponse.json(
        { error: 'Agreement is not in a state where OTPs can be generated' },
        { status: 400 }
      );
    }

    const sigIndex = agreement.signatures.findIndex(
      (s: ISignature) => s.partyEmail === partyEmail
    );

    if (sigIndex === -1) {
      return NextResponse.json(
        { error: 'Party not found in agreement' },
        { status: 404 }
      );
    }

    if (agreement.signatures[sigIndex].signedAt) {
      return NextResponse.json(
        { error: 'This party has already signed the agreement' },
        { status: 400 }
      );
    }

    const rawOtp = generateOTP();
    const hashedOtp = await bcryptjs.hash(rawOtp, 10);
    const otpExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    agreement.signatures[sigIndex].otp = hashedOtp;
    agreement.signatures[sigIndex].otpExpiry = otpExpiry;
    agreement.signatures[sigIndex].otpVerified = false;

    await agreement.save();

    const partyName = agreement.signatures[sigIndex].partyName;

    // Was only console.log'd ("in production, send email here") while the
    // raw OTP was returned directly in the API response -- meaning ANY
    // caller who could reach this route (which itself had no auth check
    // at all until the fix above) could read the OTP straight from the
    // HTTP response, completely defeating the point of a signer-side OTP.
    // Now actually emails it and never includes it in the response.
    const emailResult = await sendAgreementOtpEmail({
      to: partyEmail,
      partyName,
      agreementTitle: agreement.title,
      otp: rawOtp,
      businessId: (agreement as any).businessId?.toString?.(),
    });
    if (!emailResult.success) {
      console.error("AGREEMENT OTP EMAIL FAILED", emailResult.error);
    }

    logAction({
      action: "REQUEST_OTP",
      entity: "Agreement",
      entityId: id,
      after: { partyEmail },
      req,
    });

    return NextResponse.json({
      sent: emailResult.success,
      message: emailResult.success
        ? 'OTP sent to the signer\'s email.'
        : 'OTP generated but the email failed to send -- check email integration configuration.',
      expiresAt: otpExpiry,
    });
  } catch (error) {
    console.error('POST /api/agreements/[id]/otp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
