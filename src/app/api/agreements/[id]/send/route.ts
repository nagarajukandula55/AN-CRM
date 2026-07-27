import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { IParty, ISignature } from '@/models/Agreement';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import { logAction } from "@/lib/audit/logAction";
import { sendAgreementOtpEmail } from "@/services/email/resend.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (!['DRAFT', 'PENDING_SIGNATURE'].includes(agreement.status)) {
      return NextResponse.json(
        { error: 'Agreement cannot be sent in its current status' },
        { status: 400 }
      );
    }

    if (!agreement.content || agreement.content.trim() === '') {
      return NextResponse.json(
        { error: 'Agreement content is empty. Please add content before sending.' },
        { status: 400 }
      );
    }

    if (!agreement.parties || agreement.parties.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 parties are required to send an agreement' },
        { status: 400 }
      );
    }

    const missingEmailParty = agreement.parties.find((p: IParty) => !p.email);
    if (missingEmailParty) {
      return NextResponse.json(
        {
          error: `Party "${missingEmailParty.name}" is missing an email address. All parties must have an email before the agreement can be sent for signing.`,
        },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const signingLinks: { partyEmail: string; partyName: string; signingLink: string; emailSent: boolean }[] = [];

    for (const party of agreement.parties) {
      const partyEmail: string = party.email as string;

      const rawOtp = generateOTP();
      const hashedOtp = await bcryptjs.hash(rawOtp, 10);
      const otpExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      const sigIndex = agreement.signatures.findIndex(
        (s: ISignature) => s.partyEmail === partyEmail
      );

      if (sigIndex >= 0) {
        agreement.signatures[sigIndex].otp = hashedOtp;
        agreement.signatures[sigIndex].otpExpiry = otpExpiry;
        agreement.signatures[sigIndex].otpVerified = false;
      } else {
        agreement.signatures.push({
          partyEmail,
          partyName: party.name,
          partyRole: party.role,
          otpVerified: false,
          otp: hashedOtp,
          otpExpiry,
        });
      }

      const signingLink = `${baseUrl}/agreements/${id}/sign?email=${encodeURIComponent(partyEmail)}`;

      const emailResult = await sendAgreementOtpEmail({
        to: partyEmail,
        partyName: party.name,
        agreementTitle: agreement.title,
        otp: rawOtp,
        signingLink,
        businessId: (agreement as any).businessId?.toString?.(),
      });
      if (!emailResult.success) {
        console.error(`AGREEMENT SEND EMAIL FAILED for ${partyEmail}:`, emailResult.error);
      }

      signingLinks.push({
        partyEmail,
        partyName: party.name,
        signingLink,
        emailSent: emailResult.success,
      });
    }

    agreement.status = 'PENDING_SIGNATURE';
    await agreement.save();

    logAction({
      action: "SEND",
      entity: "Agreement",
      entityId: id,
      after: { status: agreement.status },
      req,
      actor: { id: userId },
    });

    return NextResponse.json({
      message: 'Agreement sent for signing successfully',
      signingLinks: signingLinks.map(sl => ({
        partyEmail: sl.partyEmail,
        partyName: sl.partyName,
        signingLink: sl.signingLink,
        emailSent: sl.emailSent,
      })),
      agreement: {
        _id: agreement._id,
        status: agreement.status,
        title: agreement.title,
      },
    });
  } catch (error) {
    console.error('POST /api/agreements/[id]/send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
