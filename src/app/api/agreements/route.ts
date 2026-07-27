import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Agreement from '@/models/Agreement';
import { logAction } from "@/lib/audit/logAction";

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
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: x-user-id header is required' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);

  const businessId =
    request.headers.get('x-business-id') ?? searchParams.get('businessId');

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10));
  const status = searchParams.get('status');

  await connectDB();

  const filter: Record<string, unknown> = {
    isDeleted: false,
    businessId,
  };

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
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: x-user-id header is required' },
      { status: 401 }
    );
  }

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
