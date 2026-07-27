'use client'

import useSWR from 'swr'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Package, Tag, Building2 } from 'lucide-react'

interface ProductData {
  _id: string
  name: string
  sku?: string
  description?: string
  category?: string
  basePrice?: number
  taxRate?: number
  unit?: string
  hsn?: string
  reorderLevel?: number
  stock?: number
  isActive?: boolean
  images?: string[]
  slug?: string
  metaTitle?: string
  metaDescription?: string
  keywords?: string[]
  businessId?: string | { _id: string; name?: string; brandName?: string; legalName?: string }
  createdAt?: string
}

function businessLabel(businessId: ProductData['businessId']): string {
  if (!businessId) return '—'
  if (typeof businessId === 'string') return businessId
  return businessId.brandName || businessId.legalName || businessId.name || businessId._id
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export default function ProductDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const { data: productRes, isLoading: loading, error: fetchErr } = useSWR(id ? `/api/products/${id}` : null)
  const product: ProductData | null = productRes?.success ? productRes.product : null
  const error: string | null = fetchErr
    ? 'Something went wrong'
    : productRes && !productRes.success
    ? productRes.error || 'Failed to load product'
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error || 'Product not found'}</p>
          <button
            onClick={() => router.push('/admin/products')}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            Back to Products
          </button>
        </div>
      </div>
    )
  }

  const rowCls = 'flex justify-between py-2.5 border-b border-gray-100 last:border-0'
  const labelCls = 'text-xs text-gray-400'
  const valueCls = 'text-sm text-gray-900 font-medium'

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={() => router.push('/admin/products')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition shrink-0 mt-1"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{product.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                product.isActive === false ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {product.isActive === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1 font-mono">{product.sku || '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {product.images && product.images.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex gap-3 flex-wrap">
                  {product.images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={img} alt={product.name} className="w-24 h-24 object-cover rounded-xl border border-gray-100" />
                  ))}
                </div>
              </div>
            )}

            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Product Details
              </h2>
              <div className={rowCls}><span className={labelCls}>SKU</span><span className={`${valueCls} font-mono`}>{product.sku || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Category</span><span className={valueCls}>{product.category || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Unit</span><span className={valueCls}>{product.unit || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>HSN Code</span><span className={`${valueCls} font-mono`}>{product.hsn || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Base Price</span><span className={valueCls}>{product.basePrice != null ? fmt(product.basePrice) : '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Tax Rate</span><span className={valueCls}>{product.taxRate != null ? `${product.taxRate}%` : '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Stock</span><span className={valueCls}>{product.stock ?? 0}</span></div>
              <div className={rowCls}><span className={labelCls}>Reorder Level</span><span className={valueCls}>{product.reorderLevel ?? 0}</span></div>
              {product.description && (
                <div className="pt-3">
                  <p className={labelCls}>Description</p>
                  <p className="text-sm text-gray-700 mt-1">{product.description}</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> SEO
              </h2>
              <div className={rowCls}><span className={labelCls}>Slug</span><span className={`${valueCls} font-mono`}>{product.slug || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Meta Title</span><span className={valueCls}>{product.metaTitle || '—'}</span></div>
              <div className={rowCls}><span className={labelCls}>Meta Description</span><span className={valueCls}>{product.metaDescription || '—'}</span></div>
              {product.keywords && product.keywords.length > 0 && (
                <div className="pt-3 flex flex-wrap gap-1.5">
                  {product.keywords.map((k) => (
                    <span key={k} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{k}</span>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Business
              </h2>
              <p className="text-sm font-medium text-gray-900">{businessLabel(product.businessId)}</p>
              {product.createdAt && (
                <p className="text-xs text-gray-400 mt-3">
                  Created {new Date(product.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
