'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState([])

  useEffect(() => {
    loadBusinesses()
  }, [])

  async function loadBusinesses() {
    try {
      const response = await fetch('/api/businesses/list')

      const data = await response.json()

      if (data.success) {
        setBusinesses(data.businesses)
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-8">
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            AN GROUP OS
          </p>

          <h1 className="mt-4 text-5xl font-black">
            Businesses
          </h1>
        </div>

        <Link
          href="/businesses/create"
          className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 font-semibold"
        >
          Create Business
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {businesses.map((business: any) => (
          <Link
            key={business._id}
            href={`/businesses/${business._id}`}
            className="rounded-[32px] border border-white/10 bg-white/5 p-6 transition-all hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
                {business.businessType}
              </span>

              <span className="text-green-400">
                Active
              </span>
            </div>

            <h2 className="mt-6 text-3xl font-black">
              {business.name}
            </h2>

            <p className="mt-4 text-slate-400">
              {business.industry}
            </p>

            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="text-sm text-slate-500">
                {business.email}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
