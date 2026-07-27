"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hybrid "Model" picker -- select from the DeviceModel master list scoped
 * to the chosen brand, or type a one-off value that isn't in the list yet.
 * Brand/Appointment Type/Request Type stay dropdown-only (super-admin
 * configured master data); Model is the one field explicitly asked to
 * support both ("hybrid box, select from list or type").
 */
export function ModelInput({
  value,
  onChange,
  businessId,
  brandId,
  className,
  placeholder = "Select or type a model",
}: {
  value: string;
  onChange: (v: string) => void;
  businessId: string | null;
  brandId: string;
  className?: string;
  placeholder?: string;
}) {
  const [options, setOptions] = useState<{ _id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!businessId || !brandId) {
      setOptions([]);
      return;
    }
    fetch(`/api/device-models?businessId=${businessId}&brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => setOptions(d.models || []))
      .catch(() => {});
  }, [businessId, brandId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = value
    ? options.filter((o) => o.name.toLowerCase().includes(value.toLowerCase()))
    : options;

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={brandId ? placeholder : "Select a brand first"}
        disabled={!brandId}
        className={className}
      />
      {open && brandId && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          {filtered.map((o) => (
            <button
              type="button"
              key={o._id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
