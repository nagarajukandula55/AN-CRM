import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose from 'mongoose'
import { ChatMessage, ChatRoom } from '@/models/ChatMessage'
import { logAction } from '@/lib/audit/logAction'
import { sendPushToUsers } from '@/services/push.service'

// GET /api/chat/messages?roomId=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    if (!businessId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const roomId = req.nextUrl.searchParams.get('roomId')
    if (!roomId) {
      return NextResponse.json({ error: 'roomId required' }, { status: 400 })
    }

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '100'), 200)

    const messages = await ChatMessage.find({
      roomId: new mongoose.Types.ObjectId(roomId),
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()

    return NextResponse.json({ messages })
  } catch (err) {
    console.error('GET /api/chat/messages error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/chat/messages — send a message
export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const businessId = req.headers.get('x-active-business-id')
    const userId = req.headers.get('x-user-id')

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { content, roomId, senderName } = body

    if (!content?.trim() || !roomId) {
      return NextResponse.json({ error: 'content and roomId required' }, { status: 400 })
    }

    const message = await ChatMessage.create({
      roomId: new mongoose.Types.ObjectId(roomId),
      senderId: new mongoose.Types.ObjectId(userId),
      senderName: senderName || 'Unknown',
      content: content.trim(),
      type: 'TEXT',
      isDeleted: false,
    })

    // Update lastMessageAt on the room
    const room = await ChatRoom.findByIdAndUpdate(roomId, { lastMessageAt: new Date() })

    // Push to every other member — fire-and-forget, must never block or
    // fail the send itself. Excludes the sender (no "you got a message
    // from yourself" notification).
    if (room?.members?.length) {
      const recipients = room.members
        .map((m: any) => String(m))
        .filter((id: string) => id !== userId)
      sendPushToUsers(recipients, {
        title: room.type === 'DIRECT' ? senderName || 'New message' : `#${room.name}`,
        body: content.trim(),
        data: { roomId },
      }).catch(() => {})
    }

    logAction({
      action: "CREATE",
      entity: "ChatMessage",
      entityId: message?._id?.toString(),
      after: { roomId, content: content.trim(), type: 'TEXT' },
      req,
      actor: { id: userId, businessId },
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (err) {
    console.error('POST /api/chat/messages error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
