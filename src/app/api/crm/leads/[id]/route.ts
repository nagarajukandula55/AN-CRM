/**
 * CRM Lead Detail
 * PATCH  /api/crm/leads/[id]  — update lead (stage, fields, etc.)
 * DELETE /api/crm/leads/[id]  — soft delete lead
 */

import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose, { Schema, Document, Model } from 'mongoose'
import { logAction } from '@/lib/audit/logAction'

// Re-use the same schema definition (Next.js may import this separately)
const LeadSchema = new Schema(
  {
    name: String, company: String, email: String, phone: String,
    source: String, stage: String, priority: String,
    value: Number, currency: String, businessId: String,
    assignedTo: String, notes: String, tags: [String],
    isDeleted: { type: Boolean, default: false },
    createdBy: String,
  },
  { timestamps: true, versionKey: false }
)

const Lead: Model<any> = mongoose.models.Lead || mongoose.model('Lead', LeadSchema)

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    const { id } = await params
    await connectDB()

    const body = await req.json()
    const allowedFields = ['name', 'company', 'email', 'phone', 'source', 'stage', 'priority', 'value', 'currency', 'assignedTo', 'notes', 'tags', 'businessId']
    const updates: any = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field]
    }

    const lead = await Lead.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )

    if (!lead) {
      return NextResponse.json({ success: false, message: 'Lead not found' }, { status: 404 })
    }

    logAction({
      action: "UPDATE",
      entity: "Lead",
      entityId: id,
      after: updates,
      req,
      actor: { id: userId },
    })

    return NextResponse.json({ success: true, lead })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    const { id } = await params
    await connectDB()

    await Lead.findByIdAndUpdate(id, { isDeleted: true })

    logAction({
      action: "DELETE",
      entity: "Lead",
      entityId: id,
      req,
      actor: { id: userId },
    })

    return NextResponse.json({ success: true, message: 'Lead deleted' })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
