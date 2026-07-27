import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose from 'mongoose'
import { ChatRoom } from '@/models/ChatMessage'
import { logAction } from '@/lib/audit/logAction'

// GET /api/chat/dm?with=<userId>
// POST /api/chat/dm { withUserId }
// Returns (or creates) the DIRECT room between the current user and the target user.

async function getOrCreateDM(businessId: string, userId: string, withUserId: string, req?: Request) {
  const members = [
    new mongoose.Types.ObjectId(userId),
    new mongoose.Types.ObjectId(withUserId),
  ].sort((a, b) => a.toString().localeCompare(b.toString()))

  const memberStrings = members.map(m => m.toString()).sort()
  const dmName = `dm:${memberStrings.join(':')}`

  let room = await ChatRoom.findOne({
    businessId: new mongoose.Types.ObjectId(businessId),
    type: 'DIRECT',
    name: dmName,
  })

  if (!room) {
    room = await ChatRoom.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      name: dmName,
      type: 'DIRECT',
      members,
      createdBy: new mongoose.Types.ObjectId(userId),
      isActive: true,
    })

    logAction({
      action: "CREATE",
      entity: "ChatRoom",
      entityId: room?._id?.toString(),
      after: { businessId, type: 'DIRECT', members: memberStrings },
      req,
      actor: { id: userId, businessId },
    })
  }

  return room
}

export async function GET(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    const userId = req.headers.get('x-user-id')

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const withUserId = req.nextUrl.searchParams.get('with')
    if (!withUserId) {
      return NextResponse.json({ error: 'Missing `with` param' }, { status: 400 })
    }

    const room = await getOrCreateDM(businessId, userId, withUserId, req)
    return NextResponse.json({ room })
  } catch (err) {
    console.error('GET /api/chat/dm error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    const userId = req.headers.get('x-user-id')

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const withUserId = body.withUserId

    if (!withUserId) {
      return NextResponse.json({ error: 'Missing withUserId' }, { status: 400 })
    }

    const room = await getOrCreateDM(businessId, userId, withUserId, req)
    return NextResponse.json({ room })
  } catch (err) {
    console.error('POST /api/chat/dm error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
