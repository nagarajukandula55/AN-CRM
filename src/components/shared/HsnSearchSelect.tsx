"use client";

import { useEffect, useState } from "react";

interface HsnRate {
  hsnCode: string;
  gstRate: number;
  description?: string;
}

interface Props {
  value: string;
  businessId?: string;
  onSelect: (rate: HsnRate) => void;
  onChange: (hsnCode: string) => void;
}

export default function HsnSearchSelect({ value, businessId, onSelect, onChange }: Props) {
  const [all, setAll] = useState<HsnRate[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    fetch(`/api/hsn-tax-rates?${params}`)
      .then((r) => r.json())
      .then((d) => d.success && setAll(d.rates || []))
      .catch(() => {});
  }, [businessId]);

  const matches = value.trim()
    ? all.filter(
        (r) =>
          r.hsnCode.toLowerCase().includes(value.trim().toLowerCase()) ||
          r.description?.toLowerCase().includes(value.trim().toLowerCase())
      )
    : all;

  return (
    <div className="relative w-full">
      <input
        className="w-full border rounded p-2"
        placeholder="Search HSN code or description…"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-auto rounded border bg-white shadow-lg z-50">
          {matches.slice(0, 30).map((r) => (
            <div
              key={r.hsnCode}
              className="cursor-pointer p-2 hover:bg-gray-100"
              onMouseDown={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              <div className="font-medium font-mono text-sm">{r.hsnCode} — GST {r.gstRate}%</div>
              {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
            </div>
          ))}
        </div>
      )}
      {open && value.trim() && matches.length === 0 && (
        <div className="absolute left-0 right-0 mt-1 rounded border bg-white shadow-lg z-50 p-3">
          <p className="text-sm text-gray-500">No matching HSN code — enter the GST rate manually below.</p>
        </div>
      )}
    </div>
  );
}
