'use client';

import { useEffect, useState } from 'react';

export interface BusinessScopeValue {
  businessScope: 'SINGLE' | 'MULTIPLE' | 'ALL';
  businessIds: string[];
}

interface BusinessOption {
  _id: string;
  name: string;
  brandName?: string;
}

/**
 * Shared "which business(es) can see this" control for catalog reference
 * data (Brand, Product Category, Material Category, Fault Code, Solution).
 * Fetches the business list once from /api/auth/me (Super Admin gets every
 * active business there already). Reused across every admin master page
 * instead of rebuilding this picker per page.
 */
export default function BusinessScopeControl({
  value,
  onChange,
  excludeBusinessId,
}: {
  value: BusinessScopeValue;
  onChange: (v: BusinessScopeValue) => void;
  /** The business this record's primary businessId already belongs to --
   * excluded from the "Multiple" picker since it's always included via SINGLE. */
  excludeBusinessId?: string;
}) {
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setBusinesses(d.businesses || [])).catch(() => {});
  }, []);

  const options = businesses.filter(b => b._id !== excludeBusinessId);

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1.5">Visible to</label>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {(['SINGLE', 'MULTIPLE', 'ALL'] as const).map(scope => (
          <button
            key={scope}
            type="button"
            onClick={() => onChange({ ...value, businessScope: scope })}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              value.businessScope === scope
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {scope === 'SINGLE' ? 'This Business' : scope === 'MULTIPLE' ? 'Multiple' : 'All Businesses'}
          </button>
        ))}
      </div>

      {value.businessScope === 'MULTIPLE' && (
        <div className="border border-gray-200 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
          {options.length === 0 ? (
            <p className="text-xs text-gray-400 px-1">No other businesses found.</p>
          ) : (
            options.map(b => {
              const checked = value.businessIds.includes(b._id);
              return (
                <label key={b._id} className="flex items-center gap-2 px-1 py-0.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange({
                        ...value,
                        businessIds: checked
                          ? value.businessIds.filter(id => id !== b._id)
                          : [...value.businessIds, b._id],
                      })
                    }
                  />
                  {b.brandName || b.name}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
