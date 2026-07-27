'use client'

import { useEffect, useState } from 'react'

export default function BusinessDetailsPage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const [business, setBusiness] =
    useState<any>(null)

  const [locations, setLocations] =
    useState<any[]>([])

  const [settings, setSettings] =
    useState<any>(null)

  const [savingDefaultPublic, setSavingDefaultPublic] =
    useState(false)

  useEffect(() => {
    async function initialize() {
      const resolvedParams = await params

      loadBusiness(resolvedParams.id)
    }

    initialize()
  }, [])

  async function loadBusiness(id: string) {
    try {
      const response = await fetch(
        `/api/businesses/${id}`
      )

      const data = await response.json()

      if (data.success) {
        setBusiness(data.business)
        setLocations(data.locations)
        setSettings(data.settings)
      }
    } catch (error) {
      console.error(error)
    }
  }

  async function toggleDefaultPublic(next: boolean) {
    setSavingDefaultPublic(true)
    try {
      const response = await fetch(
        `/api/businesses/${business._id}/default-public`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDefaultPublicBusiness: next }),
        }
      )
      const data = await response.json()
      if (data.success) {
        setBusiness(data.business)
      } else {
        alert(data.message || 'Failed to update')
      }
    } catch (error) {
      console.error(error)
    } finally {
      setSavingDefaultPublic(false)
    }
  }

  if (!business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111f] text-white">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />

          <h2 className="mt-8 text-3xl font-black">
            Loading Business...
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07111f] p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[40px] border border-white/10 bg-white/5 p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
                  {business.businessType}
                </span>

                <span className="rounded-full bg-green-500/10 px-4 py-2 text-sm text-green-400">
                  Active
                </span>
              </div>

              <h1 className="mt-6 text-6xl font-black">
                {business.name}
              </h1>

              <p className="mt-4 max-w-3xl text-lg text-slate-400">
                {business.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <InfoCard
                title="Industry"
                value={business.industry}
              />

              <InfoCard
                title="Entity"
                value={business.legalEntityType}
              />

              <InfoCard
                title="Business Code"
                value={business.businessCode}
              />

              <InfoCard
                title="AI Enabled"
                value={
                  business.aiEnabled
                    ? 'Enabled'
                    : 'Disabled'
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            <SectionCard title="Business Information">
              <GridItem
                label="Legal Name"
                value={business.legalName}
              />

              <GridItem
                label="Brand Name"
                value={business.brandName}
              />

              <GridItem
                label="Website"
                value={business.website}
              />

              <GridItem
                label="Email"
                value={business.email}
              />

              <GridItem
                label="Phone"
                value={business.phone}
              />

              <GridItem
                label="GST Number"
                value={business.gstNumber}
              />

              <GridItem
                label="PAN Number"
                value={business.panNumber}
              />
            </SectionCard>

            <SectionCard title="Locations">
              <div className="space-y-5">
                {locations.map((location, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-white/10 bg-[#0d1728] p-5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold capitalize">
                        {location.type}
                      </h3>

                      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
                        Active
                      </span>
                    </div>

                    <div className="mt-5 text-slate-400">
                      <p>{location.addressLine1}</p>

                      <p>{location.addressLine2}</p>

                      <p>
                        {location.city}, {location.state}
                      </p>

                      <p>{location.country}</p>

                      <p>{location.pincode}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Business Settings">
              <GridItem
                label="Currency"
                value={settings?.currency}
              />

              <GridItem
                label="Timezone"
                value={settings?.timezone}
              />

              <GridItem
                label="Language"
                value={settings?.language}
              />

              <GridItem
                label="Invoice Prefix"
                value={settings?.invoicePrefix}
              />

              <GridItem
                label="Order Prefix"
                value={settings?.orderPrefix}
              />

              <GridItem
                label="Financial Year"
                value={settings?.financialYear}
              />
            </SectionCard>

            <div className="rounded-[32px] border border-emerald-500/10 bg-gradient-to-b from-emerald-500/10 to-teal-700/10 p-7">
              <p className="text-sm uppercase tracking-widest text-emerald-300">
                PUBLIC APPOINTMENT BOOKING
              </p>

              <h3 className="mt-4 text-2xl font-black">
                {business.isDefaultPublicBusiness ? 'DEFAULT' : 'NOT DEFAULT'}
              </h3>

              <p className="mt-5 text-slate-300">
                {business.isDefaultPublicBusiness
                  ? 'Public pages (e.g. the homepage\'s "Book an Appointment" link) with no specific business in the URL submit against this business.'
                  : 'Turn this on to make public appointment links default to this business instead of AN Group\'s own platform record.'}
              </p>

              <button
                onClick={() => toggleDefaultPublic(!business.isDefaultPublicBusiness)}
                disabled={savingDefaultPublic}
                className="mt-8 w-full rounded-2xl bg-white py-4 font-semibold text-black disabled:opacity-50"
              >
                {savingDefaultPublic
                  ? 'Saving…'
                  : business.isDefaultPublicBusiness
                    ? 'Remove as Default'
                    : 'Set as Default Public Business'}
              </button>
            </div>

            <div className="rounded-[32px] border border-cyan-500/10 bg-gradient-to-b from-cyan-500/10 to-blue-700/10 p-7">
              <p className="text-sm uppercase tracking-widest text-cyan-300">
                AI STATUS
              </p>

              <h3 className="mt-4 text-4xl font-black">
                ACTIVE
              </h3>

              <p className="mt-5 text-slate-300">
                This business is connected to the AN Group
                Intelligence Engine.
              </p>

              <button className="mt-8 w-full rounded-2xl bg-white py-4 font-semibold text-black">
                Open AI Workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  children,
}: any) {
  return (
    <div className="rounded-[32px] border border-white/10 bg-white/5 p-8">
      <h2 className="mb-8 text-3xl font-black">
        {title}
      </h2>

      <div className="space-y-5">
        {children}
      </div>
    </div>
  )
}

function GridItem({
  label,
  value,
}: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1728] p-5">
      <p className="text-sm text-slate-400">
        {label}
      </p>

      <h3 className="mt-2 text-lg font-semibold">
        {value || '-'}
      </h3>
    </div>
  )
}

function InfoCard({
  title,
  value,
}: any) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0d1728] p-6">
      <p className="text-sm text-slate-400">
        {title}
      </p>

      <h3 className="mt-4 text-2xl font-black">
        {value}
      </h3>
    </div>
  )
}
