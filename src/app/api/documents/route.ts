/**
 * Documents API
 * GET /api/documents — list documents (agreements + other docs)
 */

import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Agreement from '@/models/Agreement'

export async function GET(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    await connectDB()

    const agreements = await Agreement.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    return NextResponse.json({
      success: true,
      documents: agreements,
      total: agreements.length,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
