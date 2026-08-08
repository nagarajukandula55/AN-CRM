/**
 * CRM Leads API
 * GET  /api/crm/leads  — list leads with optional filters
 * POST /api/crm/leads  — create new lead
 */

import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import mongoose, { Schema, Document, Model } from 'mongoose'
import { logAction } from '@/lib/audit/logAction'
import { captureCustomer } from '@/services/customer.service'
import { getEnrichedSession } from '@/lib/auth/session-enriched'
import { resolveAuthorizedBusinessId } from '@/lib/auth/resolveAuthorizedBusinessId'

/* =========================================================
 * Inline Lead model (to avoid extra model file dependency)
 * =======================================================*/

export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH'

interface ILead extends Document {
  name: string
  company?: string
  email?: string
  phone?: string
  source?: string
  stage: LeadStage
  priority: LeadPriority
  value?: number
  currency: string
  businessId?: string
  assignedTo?: string
  notes?: string
  tags: string[]
  isDeleted: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const LeadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true, trim: true, index: true },
    company: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    source: { type: String },
    stage: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'],
      default: 'NEW',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM',
    },
    value: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    businessId: { type: String, index: true },
    assignedTo: { type: String },
    notes: { type: String },
    tags: { type: [String], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
)

const Lead: Model<ILead> =
  mongoose.models.Lead || mongoose.model<ILead>('Lead', LeadSchema)

/* =========================================================
 * Route Handlers
 * =======================================================*/

export async function GET(req: Request) {
  try {
    // SECURITY: this route previously had NO authentication check at all
    // -- an unauthenticated caller could list every lead across every
    // business just by hitting the URL, and query.businessId (below) was
    // a raw, unverified query param with no ownership check on top of
    // that. Now requires a session and locks non-super-admins to their
    // own business, same pattern as crm/calls and crm/jobsheets.
    const session = await getEnrichedSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get('businessId'),
      session.isSuperAdmin,
      session.business?.businessId || null
    )
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const query: any = { isDeleted: false }
    if (stage) query.stage = stage
    if (businessId) query.businessId = businessId
    else if (!session.isSuperAdmin) {
      return NextResponse.json({ success: true, leads: [], pagination: { page: 1, limit, total: 0, pages: 0 }, stageCounts: {} })
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Lead.countDocuments(query),
    ])

    // Stage counts for kanban view
    // SECURITY: this used to $match on isDeleted only, ignoring the same
    // businessId scoping the list query above used -- stage counts leaked
    // a cross-tenant aggregate regardless of how the main list was scoped.
    const stageCounts = await Lead.aggregate([
      { $match: query },
      { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' } } },
    ])

    return NextResponse.json({
      success: true,
      leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stageCounts: stageCounts.reduce((acc: any, s: any) => {
        acc[s._id] = { count: s.count, totalValue: s.totalValue }
        return acc
      }, {}),
    })
  } catch (error: any) {
    console.error('CRM leads GET error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const userId = req.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Unauthorised' }, { status: 401 })
    }

    await connectDB()

    const session = await getEnrichedSession()
    const body = await req.json()
    const { name, company, email, phone, source, stage, priority, value, currency, assignedTo, notes, tags } = body
    // SECURITY: body.businessId used to be written straight onto the new
    // Lead with no ownership check -- any authenticated caller could
    // attribute a lead to any business.
    const businessId = await resolveAuthorizedBusinessId(
      userId,
      body.businessId || null,
      !!session?.isSuperAdmin,
      session?.business?.businessId || null
    )

    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: 'Lead name is required' }, { status: 400 })
    }

    const lead = await Lead.create({
      name: name.trim(),
      company: company?.trim(),
      email: email?.toLowerCase()?.trim(),
      phone: phone?.trim(),
      source,
      stage: stage || 'NEW',
      priority: priority || 'MEDIUM',
      value: value ? parseFloat(value) : 0,
      currency: currency || 'INR',
      businessId,
      assignedTo,
      notes,
      tags: tags || [],
      createdBy: userId,
    })

    logAction({
      action: "CREATE",
      entity: "Lead",
      entityId: lead?._id?.toString(),
      after: body,
      req,
      actor: { id: userId },
    })

    captureCustomer({
      businessId,
      name: name.trim(),
      phone: phone?.trim(),
      email: email?.trim(),
      sourceModule: "CRM_LEAD",
      sourceLabel: source || "CRM Lead",
    })

    return NextResponse.json({ success: true, lead }, { status: 201 })
  } catch (error: any) {
    console.error('CRM leads POST error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
