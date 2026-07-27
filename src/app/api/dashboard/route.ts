import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    revenue: '₹48.6L',
    employees: 112,
    aiAgents: 12,
    automation: '84%',
    operationalEfficiency: '94%',
    aiInsights: 28,
    pendingWorkflows: 142,
    companies: 6,
    businessUnits: [
      {
        name: 'ShopNative Ecommerce',
        revenue: '₹18.4L',
        growth: '+18%',
      },
      {
        name: 'Repair Operations',
        revenue: '₹11.2L',
        growth: '+9%',
      },
      {
        name: 'Logistics Network',
        revenue: '₹7.8L',
        growth: '+12%',
      },
    ],
  })
}
