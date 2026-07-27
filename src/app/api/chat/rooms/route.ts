import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose from 'mongoose'
import { ChatRoom } from '@/models/ChatMessage'
import { logAction } from '@/lib/audit/logAction'

// GET /api/chat/rooms?type=CHANNEL|DIRECT
export async function GET(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    if (!businessId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const type = req.nextUrl.searchParams.get('type') || 'CHANNEL'

    const rooms = await ChatRoom.find({
      businessId: new mongoose.Types.ObjectId(businessId),
      type,
      isActive: true,
    }).sort({ lastMessageAt: -1, createdAt: 1 })

    return NextResponse.json({ rooms })
  } catch (err) {
    console.error('GET /api/chat/rooms error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/chat/rooms — create a new channel
export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    const userId = req.headers.get('x-user-id')
    if (!businessId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Check duplicate channel name in this business
    const exists = await ChatRoom.findOne({
      businessId: new mongoose.Types.ObjectId(businessId),
      name: name.trim().toLowerCase(),
      type: 'CHANNEL',
      isActive: true,
    })
    if (exists) {
      return NextResponse.json({ error: 'Channel already exists' }, { status: 409 })
    }

    const room = await ChatRoom.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      name: name.trim().toLowerCase(),
      type: 'CHANNEL',
      description,
      createdBy: new mongoose.Types.ObjectId(userId),
      members: [new mongoose.Types.ObjectId(userId)],
      isActive: true,
    })

    logAction({
      action: "CREATE",
      entity: "ChatRoom",
      entityId: room?._id?.toString(),
      after: { businessId, name: name.trim().toLowerCase(), type: 'CHANNEL', description },
      req,
      actor: { id: userId, businessId },
    })

    return NextResponse.json({ room }, { status: 201 })
  } catch (err) {
    console.error('POST /api/chat/rooms error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
