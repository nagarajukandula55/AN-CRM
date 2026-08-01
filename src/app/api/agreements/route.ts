import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement from '@/models/Agreement';
import { logAction } from "@/lib/audit/logAction";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

const VALID_TYPES = [
  'NDA',
  'EMPLOYMENT',
  'VENDOR',
  'SERVICE',
  'PARTNERSHIP',
  'LEASE',
  'CONSULTANCY',
  'FRANCHISE',
  'MOU',
  'CUSTOM',
] as const;

type AgreementType = (typeof VALID_TYPES)[number];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);

  // A non-super-admin can only ever list agreements for the business
  // they're currently operating in -- whatever businessId a client passes
  // is ignored for them, not trusted, so switching the query param/header
  // can't read another business's agreements. A super admin may still
  // filter by an explicit businessId (or omit it to see everything).
  const requestedBusinessId =
    request.headers.get('x-business-id') ?? searchParams.get('businessId');
  const businessId = session.isSuperAdmin
    ? requestedBusinessId
    : session.business?.businessId;

  if (!session.isSuperAdmin && !businessId) {
    return NextResponse.json(
      { success: false, error: 'No active business selected' },
      { status: 400 }
    );
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10));
  const status = searchParams.get('status');

  await connectDB();

  const filter: Record<string, unknown> = { isDeleted: false };
  // businessId is only omitted when a super admin didn't request a
  // specific one -- in that case they legitimately see every business's
  // agreements, so the field is left out of the filter entirely rather
  // than set to null/undefined (which would match nothing).
  if (businessId) filter.businessId = businessId;

  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;

  const [agreements, total] = await Promise.all([
    Agreement.find(filter).skip(skip).limit(limit).lean(),
    Agreement.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    success: true,
    agreements,
    total,
    page,
    totalPages,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getEnrichedSession();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const userId = session.user.id;

  let body: {
    title?: string;
    type?: string;
    content?: string;
    parties?: unknown;
    expiresAt?: string;
    businessId?: string;
    governingLaw?: string;
    jurisdiction?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { title, type, content, parties, expiresAt, businessId, governingLaw, jurisdiction, notes } = body;

  if (!title) {
    return NextResponse.json(
      { success: false, error: 'title is required' },
      { status: 400 }
    );
  }

  if (!type) {
    return NextResponse.json(
      { success: false, error: 'type is required' },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as AgreementType)) {
    return NextResponse.json(
      {
        success: false,
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  if (!content) {
    return NextResponse.json(
      { success: false, error: 'content is required' },
      { status: 400 }
    );
  }

  if (!businessId) {
    return NextResponse.json(
      { success: false, error: 'businessId is required' },
      { status: 400 }
    );
  }

  // An agreement can only ever be issued for the business the caller is
  // actually operating in -- a client-supplied businessId that doesn't
  // match their active business is rejected outright, not silently
  // trusted. Super admins may issue for any business.
  if (!session.isSuperAdmin && businessId !== session.business?.businessId) {
    return NextResponse.json(
      { success: false, error: 'You do not have access to issue an agreement for this business.' },
      { status: 403 }
    );
  }

  await connectDB();

  const agreement = await Agreement.create({
    title,
    type,
    content,
    parties,
    expiresAt,
    businessId,
    governingLaw,
    jurisdiction,
    notes,
    status: 'DRAFT',
    createdBy: userId,
  });

  logAction({
    action: "CREATE",
    entity: "Agreement",
    entityId: agreement?._id?.toString(),
    after: agreement,
    req: request,
    actor: { id: userId, businessId },
  });

  return NextResponse.json({ success: true, agreement }, { status: 201 });
}
