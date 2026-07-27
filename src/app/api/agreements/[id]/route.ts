import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement from '@/models/Agreement';
import VendorProfile from '@/models/VendorProfile';
import mongoose from 'mongoose';
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("agreements", "view"));
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

    const agreement = await Agreement.findById(id)
      .select('-signatures.otp')
      .lean();

    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    return NextResponse.json({ agreement });
  } catch (error) {
    console.error('GET /api/agreements/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
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
    const userId = session.user.id;

    await connectDB();

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (agreement.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only DRAFT agreements can be edited' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      title,
      parties,
      content,
      variables,
      expiresAt,
      governingLaw,
      jurisdiction,
    } = body;

    if (title) agreement.title = title;
    if (content !== undefined) agreement.content = content;
    if (variables !== undefined) agreement.variables = variables;
    if (expiresAt) agreement.expiresAt = new Date(expiresAt);
    if (governingLaw) agreement.governingLaw = governingLaw;
    if (jurisdiction) agreement.jurisdiction = jurisdiction;

    if (parties) {
      agreement.parties = parties;
      agreement.signatures = parties.map((p: { name: string; email: string; role: string }) => ({
        partyEmail: p.email,
        partyName: p.name,
        partyRole: p.role,
        otpVerified: false,
      }));
    }

    await agreement.save();

    logAction({
      action: "UPDATE",
      entity: "Agreement",
      entityId: id,
      after: body,
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ agreement });
  } catch (error) {
    console.error('PUT /api/agreements/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("agreements", "delete"));
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }
    const userId = session.user.id;

    await connectDB();

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid agreement ID' }, { status: 400 });
    }

    const agreement = await Agreement.findById(id);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    if (agreement.status === 'FULLY_SIGNED') {
      return NextResponse.json(
        { error: 'Fully signed agreements cannot be cancelled' },
        { status: 400 }
      );
    }

    agreement.status = 'CANCELLED';
    await agreement.save();

    // See sign/route.ts's matching fix -- VendorProfile.ts's own comment
    // documents this AGREEMENT_CANCELLED sync as already handled here, but
    // nothing actually wrote it. A vendor whose agreement was cancelled
    // kept showing its prior in-progress status indefinitely.
    try {
      await VendorProfile.findOneAndUpdate(
        { agreementId: agreement._id },
        { $set: { status: 'AGREEMENT_CANCELLED' } }
      );
    } catch (vendorSyncErr) {
      console.error('Failed to sync VendorProfile status after cancellation:', vendorSyncErr);
    }

    console.log(`Agreement ${id} cancelled by user ${userId}`);

    logAction({
      action: "DELETE",
      entity: "Agreement",
      entityId: id,
      after: { status: 'CANCELLED' },
      req,
      actor: { id: userId },
    });

    return NextResponse.json({ message: 'Agreement cancelled successfully', agreement });
  } catch (error) {
    console.error('DELETE /api/agreements/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
