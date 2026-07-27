'use client'

import { useState } from 'react'

export default function CreateBusinessPage() {
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    brandName: '',
    businessType: '',
    industry: '',
    description: '',

    website: '',
    email: '',
    phone: '',

    gstNumber: '',
    panNumber: '',

    legalEntityType: '',

    addressLine1: '',
    addressLine2: '',

    city: '',
    state: '',
    country: 'India',
    pincode: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setLoading(true)

      const response = await fetch('/api/businesses/create', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          name: formData.name,
          legalName: formData.legalName,
          brandName: formData.brandName,

          businessType: formData.businessType,
          industry: formData.industry,

          description: formData.description,

          website: formData.website,
          email: formData.email,
          phone: formData.phone,

          gstNumber: formData.gstNumber,
          panNumber: formData.panNumber,

          legalEntityType: formData.legalEntityType,

          location: {
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,

            city: formData.city,
            state: formData.state,
            country: formData.country,
            pincode: formData.pincode,
          },
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Business created successfully')

        window.location.href = '/businesses'
      } else {
        alert(data.message)
      }
    } catch (error) {
      console.error(error)

      alert('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-white p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            AN GROUP OS
          </p>

          <h1 className="mt-4 text-5xl font-black">
            Create Business
          </h1>

          <p className="mt-4 text-slate-400">
            Register and configure a new business ecosystem.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8"
        >
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-6">
              Basic Information
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                label="Business Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
              />

              <Input
                label="Legal Name"
                name="legalName"
                value={formData.legalName}
                onChange={handleChange}
              />

              <Input
                label="Brand Name"
                name="brandName"
                value={formData.brandName}
                onChange={handleChange}
              />

              <Input
                label="Business Type"
                name="businessType"
                value={formData.businessType}
                onChange={handleChange}
              />

              <Input
                label="Industry"
                name="industry"
                value={formData.industry}
                onChange={handleChange}
              />

              <Input
                label="Legal Entity Type"
                name="legalEntityType"
                value={formData.legalEntityType}
                onChange={handleChange}
              />
            </div>

            <div className="mt-5">
              <Textarea
                label="Description"
                name="description"
                value={formData.description}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-6">
              Contact Information
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                label="Website"
                name="website"
                value={formData.website}
                onChange={handleChange}
              />

              <Input
                label="Email"
                name="email"
                value={formData.email}
                onChange={handleChange}
              />

              <Input
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />

              <Input
                label="GST Number"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleChange}
              />

              <Input
                label="PAN Number"
                name="panNumber"
                value={formData.panNumber}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-6">
              Head Office Location
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                label="Address Line 1"
                name="addressLine1"
                value={formData.addressLine1}
                onChange={handleChange}
              />

              <Input
                label="Address Line 2"
                name="addressLine2"
                value={formData.addressLine2}
                onChange={handleChange}
              />

              <Input
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
              />

              <Input
                label="State"
                name="state"
                value={formData.state}
                onChange={handleChange}
              />

              <Input
                label="Country"
                name="country"
                value={formData.country}
                onChange={handleChange}
              />

              <Input
                label="Pincode"
                name="pincode"
                value={formData.pincode}
                onChange={handleChange}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 py-5 text-lg font-bold transition-all hover:scale-[1.01]"
          >
            {loading
              ? 'Creating Business...'
              : 'Create Business'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Input({
  label,
  ...props
}: any) {
  return (
    <div>
      <label className="mb-3 block text-sm text-slate-300">
        {label}
      </label>

      <input
        {...props}
        className="w-full rounded-2xl border border-white/10 bg-[#0d1728] px-5 py-4 outline-none transition-all focus:border-cyan-400"
      />
    </div>
  )
}

function Textarea({
  label,
  ...props
}: any) {
  return (
    <div>
      <label className="mb-3 block text-sm text-slate-300">
        {label}
      </label>

      <textarea
        rows={5}
        {...props}
        className="w-full rounded-2xl border border-white/10 bg-[#0d1728] px-5 py-4 outline-none transition-all focus:border-cyan-400"
      />
    </div>
  )
}
