"use client";

/**
 * Shared State + City input pair backed by src/data/indiaLocations.ts.
 *
 * Replaces the pattern of every form hand-rolling its own state dropdown
 * (and duplicating the state name list — previously done independently in
 * register/page.tsx and admin/vendors/page.tsx) plus a free-text city
 * input with zero relationship to the selected state.
 *
 * City uses a <datalist> instead of a plain <select> so users can still
 * type a city/town we haven't curated in india-states-cities.json (the
 * dataset is a curated subset, not exhaustive) while still getting
 * autocomplete suggestions for the state they picked.
 */
import { useMemo, useState } from "react";
import { STATE_NAMES, getCitiesForState, isValidState } from "@/data/indiaLocations";
import { isValidPincodeFormat } from "@/lib/pincodeFormat";

interface StateSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
}

export function StateSelect({
  value,
  onChange,
  className,
  name = "state",
  required,
}: StateSelectProps) {
  return (
    <select
      name={name}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">Select state…</option>
      {STATE_NAMES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

interface CitySelectProps {
  value: string;
  onChange: (value: string) => void;
  state?: string;
  className?: string;
  name?: string;
  placeholder?: string;
}

export function CitySelect({
  value,
  onChange,
  state,
  className,
  name = "city",
  placeholder,
}: CitySelectProps) {
  const cities = useMemo(() => getCitiesForState(state), [state]);
  const listId = `city-list-${name}`;

  return (
    <>
      <input
        list={listId}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || (state ? "Type or pick a city" : "Select a state first")}
        className={className}
        autoComplete="off"
      />
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

interface PincodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Called once a 6-digit pincode is recognised in the dataset, with the
   * looked-up state/city — the caller decides whether/how to apply these
   * (e.g. only fill state/city if they're currently empty, to avoid
   * clobbering a value the user already typed deliberately).
   */
  onResolved?: (info: { state: string; city: string }) => void;
  className?: string;
  name?: string;
  placeholder?: string;
}

/**
 * Pincode input backed by GET /api/pincode/[pincode] (server-side lookup
 * against the PincodeEntry MongoDB collection — the full India Post
 * pincode directory, ~19,500 entries, admin-refreshable via
 * /admin/pincode-data). The dataset lives in MongoDB rather than a static
 * bundled JSON file because this app deploys on Vercel, whose filesystem
 * is read-only at runtime — see PincodeEntry.ts's comment for the full
 * reasoning. Validates the 6-digit format as you type and, once a
 * complete pincode is entered, calls the lookup API and reports the
 * resolved state/city via onResolved so the form can autofill those
 * fields.
 */
export function PincodeInput({
  value,
  onChange,
  onResolved,
  className,
  name = "pincode",
  placeholder,
}: PincodeInputProps) {
  const [notFound, setNotFound] = useState(false);
  const [looking, setLooking] = useState(false);

  async function handleChange(next: string) {
    const digitsOnly = next.replace(/[^0-9]/g, "").slice(0, 6);
    onChange(digitsOnly);
    setNotFound(false);

    if (digitsOnly.length === 6 && isValidPincodeFormat(digitsOnly)) {
      setLooking(true);
      try {
        const res = await fetch(`/api/pincode/${digitsOnly}`);
        const data = await res.json().catch(() => ({}));
        if (data?.found && data.state && isValidState(data.state)) {
          onResolved?.({ state: data.state, city: data.city || "" });
        } else {
          setNotFound(true);
        }
      } catch {
        // Silent — pincode lookup is a convenience autofill, not a hard
        // requirement; the field itself still holds whatever the user typed.
      } finally {
        setLooking(false);
      }
    }
  }

  return (
    <div>
      <input
        name={name}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || "6-digit PIN code"}
        maxLength={6}
        inputMode="numeric"
        className={className}
      />
      {looking && <p className="text-xs text-gray-400 mt-1">Looking up…</p>}
      {!looking && notFound && value.length === 6 && (
        <p className="text-xs text-amber-600 mt-1">
          Pincode not found in our directory — please select state/city manually.
        </p>
      )}
    </div>
  );
}
