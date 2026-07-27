import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement, { ISignature } from '@/models/Agreement';
import VendorProfile from '@/models/VendorProfile';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import { logAction } from "@/lib/audit/logAction";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const body = await req.json();
    const { partyEmail, otp, signatureData } = body;

    if (!partyEmail || !otp || !signatureData) {
      return NextResponse.json(
        { error: 'partyEmail, otp, and signatureData are required' },
        { status: 400 }
      );
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (!['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(agreement.status)) {
      return NextResponse.json(
        { error: 'Agreement is not in a signable state' },
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

    const sig = agreement.signatures[sigIndex];

    if (sig.signedAt) {
      return NextResponse.json(
        { error: 'This party has already signed the agreement' },
        { status: 400 }
      );
    }

    if (!sig.otp || !sig.otpExpiry) {
      return NextResponse.json(
        { error: 'No OTP found. Please request an OTP first.' },
        { status: 400 }
      );
    }

    if (new Date() > sig.otpExpiry) {
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new OTP.' },
        { status: 400 }
      );
    }

    const otpValid = await bcryptjs.compare(otp.toString(), sig.otp);
    if (!otpValid) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    agreement.signatures[sigIndex].otpVerified = true;
    agreement.signatures[sigIndex].signedAt = new Date();
    agreement.signatures[sigIndex].signatureData = signatureData;
    agreement.signatures[sigIndex].ipAddress = ipAddress;
    agreement.signatures[sigIndex].otp = undefined;
    agreement.signatures[sigIndex].otpExpiry = undefined;

    const allSigned = agreement.signatures.every((s: ISignature) => s.signedAt);
    const someSigned = agreement.signatures.some((s: ISignature) => s.signedAt);

    if (allSigned) {
      agreement.status = 'FULLY_SIGNED';
      console.log(`Agreement ${id} fully signed by all parties`);
    } else if (someSigned) {
      agreement.status = 'PARTIALLY_SIGNED';
    }

    await agreement.save();

    // Was never updated here -- VendorProfile.ts's own comment already
    // documents "AGREEMENT_SIGNED — vendor signed the agreement" as the
    // intended transition, and a matching AGREEMENT_CANCELLED transition
    // is documented for the agreement-delete route, but neither this
    // route nor that one actually wrote to VendorProfile.status. A
    // vendor's profile page kept showing whatever stage it was at before
    // signing (e.g. "Agreement Drafted") forever, even after the
    // agreement was fully signed.
    if (allSigned) {
      try {
        await VendorProfile.findOneAndUpdate(
          { agreementId: agreement._id },
          { $set: { status: 'AGREEMENT_SIGNED' } }
        );
      } catch (vendorSyncErr) {
        console.error('Failed to sync VendorProfile status after signing:', vendorSyncErr);
        // Non-fatal -- the agreement itself is already signed and saved;
        // don't fail the signer's request over this secondary sync.
      }
    }

    const updatedAgreement = await Agreement.findById(id)
      .select('-signatures.otp')
      .lean();

    logAction({
      action: "SIGN",
      entity: "Agreement",
      entityId: id,
      after: { partyEmail, status: agreement.status },
      req,
    });

    return NextResponse.json({
      message: allSigned
        ? 'Agreement fully signed by all parties'
        : 'Signature recorded successfully',
      agreement: updatedAgreement,
      fullySignd: allSigned,
    });
  } catch (error) {
    console.error('POST /api/agreements/[id]/sign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
