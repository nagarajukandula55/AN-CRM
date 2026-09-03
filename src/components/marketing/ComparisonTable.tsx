import { Sparkles, Check } from 'lucide-react'

/**
 * Shared "how we compare" table -- originally /pricing-only; now also
 * rendered on the home page per explicit direction, so it lives here once
 * instead of being duplicated.
 */

type CompareCell = boolean | 'partial'

const COMPARE_COLUMNS = [
  { key: 'us', label: 'My Biz Flow' },
  { key: 'vyapar', label: 'Vyapar' },
  { key: 'mybillbook', label: 'myBillBook' },
  { key: 'marg', label: 'Marg ERP' },
] as const

const COMPARE_ROWS: { feature: string; us: CompareCell; vyapar: CompareCell; mybillbook: CompareCell; marg: CompareCell }[] = [
  { feature: 'Purpose-built repair workorder / job-sheet flow', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Customer-facing repair status tracking page', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'GST & non-GST invoicing', us: true, vyapar: true, mybillbook: true, marg: true },
  { feature: 'Inventory, stock transfers & warehouses', us: true, vyapar: 'partial', mybillbook: 'partial', marg: true },
  { feature: 'Fault / symptom / solution code library', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'Custom report builder (build-your-own reports)', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Multi-center / sub-vendor hierarchy under one login', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Ledger Book (party-wise running balance)', us: true, vyapar: 'partial', mybillbook: 'partial', marg: true },
  { feature: 'Profit & Loss reports', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Expense tracking', us: true, vyapar: false, mybillbook: false, marg: 'partial' },
  { feature: 'Automated Telegram business reports with charts', us: true, vyapar: false, mybillbook: false, marg: false },
  { feature: 'Starting price', us: '₹549/mo launch', vyapar: '₹999/yr', mybillbook: '₹799/yr', marg: '₹8,000+/yr' } as any,
]

function CompareIcon({ value }: { value: CompareCell }) {
  if (value === true) return <Check className="h-4 w-4 text-green-300 mx-auto" />
  if (value === 'partial') return <span className="block text-center text-amber-300 text-xs font-medium">Partial</span>
  return <span className="block text-center text-gray-600 text-xs">—</span>
}

export function ComparisonSection() {
  return (
    <div className="mt-24">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-orange-300 mb-4">
          <Sparkles className="h-3.5 w-3.5" /> How we compare
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Built for repair shops. Priced under the billing apps that aren't.
        </h2>
        <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
          Generic GST billing apps don't track a single workorder. General-purpose ERPs
          weren't built for a repair counter. My Biz Flow is — at a fraction of what a
          dedicated repair-shop tool usually costs.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-sm font-medium text-gray-400 pb-4 pr-4 align-bottom">Feature</th>
              {COMPARE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`text-center pb-4 px-3 align-bottom ${
                    col.key === 'us' ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  <span className={`text-sm font-semibold ${col.key === 'us' ? 'text-sky-300' : ''}`}>{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              <tr key={row.feature} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                <td className="text-sm text-gray-300 py-3 pr-4 rounded-l-lg">{row.feature}</td>
                {COMPARE_COLUMNS.map((col) => {
                  const val = (row as any)[col.key]
                  return (
                    <td
                      key={col.key}
                      className={`py-3 px-3 text-center ${col.key === 'us' ? 'bg-sky-400/[0.06]' : ''} ${
                        col.key === 'us' && i === COMPARE_ROWS.length - 1 ? 'rounded-r-lg' : ''
                      }`}
                    >
                      {typeof val === 'string' ? (
                        <span className={`text-sm font-medium ${col.key === 'us' ? 'text-green-300' : 'text-gray-400'}`}>{val}</span>
                      ) : (
                        <CompareIcon value={val} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-gray-500 mt-6 max-w-2xl mx-auto">
        Comparison based on each product's publicly listed features and pricing as of
        2026; feature sets and prices change over time — please verify current details
        directly with each provider before deciding.
      </p>
    </div>
  )
}
