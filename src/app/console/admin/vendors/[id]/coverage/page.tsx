"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, ChevronDown, X } from "lucide-react";

type Level = "STATE" | "CITY" | "PINCODE";
type CoverageEntry = { level: Level; state: string; city?: string; pincode?: string };

function entryKey(e: CoverageEntry) {
  return `${e.level}:${e.state}:${e.city || ""}:${e.pincode || ""}`;
}

function entryLabel(e: CoverageEntry) {
  if (e.level === "STATE") return e.state;
  if (e.level === "CITY") return `${e.city}, ${e.state}`;
  return `${e.pincode} (${e.city}, ${e.state})`;
}

function CoverageList({
  title,
  entries,
  onRemove,
}: {
  title: string;
  entries: CoverageEntry[];
  onRemove: (e: CoverageEntry) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-2">
        {title} ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-3">No areas assigned yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <span
              key={entryKey(e)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 text-xs text-ink-2"
            >
              {entryLabel(e)}
              <button onClick={() => onRemove(e)} className="text-ink-3 hover:text-danger">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StateNode({
  state,
  onAddState,
  onAddCity,
  onAddPincode,
}: {
  state: string;
  onAddState: (state: string) => void;
  onAddCity: (state: string, city: string) => void;
  onAddPincode: (state: string, city: string, pincode: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: citiesJson, isLoading: loading } = useSWR(
    open ? `/api/admin/pincode-tree?level=cities&state=${encodeURIComponent(state)}` : null
  );
  const cities: string[] | null = citiesJson ? (citiesJson.success ? citiesJson.cities : []) : null;

  const toggle = () => setOpen((prev) => !prev);

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        <button onClick={toggle} className="text-ink-3 hover:text-ink-2">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="text-sm text-ink flex-1">{state}</span>
        <button
          onClick={() => onAddState(state)}
          className="text-xs text-accent hover:underline shrink-0"
        >
          + Whole state
        </button>
      </div>
      {open && (
        <div className="ml-6 border-l border-border pl-3">
          {loading && <p className="text-xs text-ink-3 py-1">Loading cities...</p>}
          {cities?.map((city) => (
            <CityNode
              key={city}
              state={state}
              city={city}
              onAddCity={onAddCity}
              onAddPincode={onAddPincode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CityNode({
  state,
  city,
  onAddCity,
  onAddPincode,
}: {
  state: string;
  city: string;
  onAddCity: (state: string, city: string) => void;
  onAddPincode: (state: string, city: string, pincode: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: pincodesJson, isLoading: loading } = useSWR(
    open ? `/api/admin/pincode-tree?level=pincodes&state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}` : null
  );
  const pincodes: string[] | null = pincodesJson ? (pincodesJson.success ? pincodesJson.pincodes : []) : null;

  const toggle = () => setOpen((prev) => !prev);

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        <button onClick={toggle} className="text-ink-3 hover:text-ink-2">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="text-sm text-ink-2 flex-1">{city}</span>
        <button
          onClick={() => onAddCity(state, city)}
          className="text-xs text-accent hover:underline shrink-0"
        >
          + Whole city
        </button>
      </div>
      {open && (
        <div className="ml-6 border-l border-border pl-3 max-h-48 overflow-y-auto">
          {loading && <p className="text-xs text-ink-3 py-1">Loading pincodes...</p>}
          {pincodes?.map((pin) => (
            <div key={pin} className="flex items-center gap-1.5 py-0.5">
              <span className="text-sm text-ink-2 flex-1 font-mono">{pin}</span>
              <button
                onClick={() => onAddPincode(state, city, pin)}
                className="text-xs text-accent hover:underline shrink-0"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VendorCoveragePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [onsite, setOnsite] = useState<CoverageEntry[]>([]);
  const [walkin, setWalkin] = useState<CoverageEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"onsite" | "walkin">("onsite");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const { data: coverageJson, isLoading: loadingCoverage } = useSWR(`/api/vendors/${id}/coverage`);
  const { data: statesJson, isLoading: loadingStates } = useSWR(`/api/admin/pincode-tree?level=states`);
  const loading = loadingCoverage || loadingStates;
  const companyName = coverageJson?.success ? coverageJson.companyName || "" : "";
  const states: string[] = statesJson?.success ? statesJson.states || [] : [];

  useEffect(() => {
    if (!coverageJson?.success) return;
    setOnsite(coverageJson.serviceCoverage?.onsite || []);
    setWalkin(coverageJson.serviceCoverage?.walkin || []);
  }, [coverageJson]);

  const list = activeTab === "onsite" ? onsite : walkin;
  const setList = activeTab === "onsite" ? setOnsite : setWalkin;

  const addEntry = (entry: CoverageEntry) => {
    setList((prev) => {
      if (prev.some((e) => entryKey(e) === entryKey(entry))) return prev;
      return [...prev, entry];
    });
  };
  const removeEntry = (entry: CoverageEntry) => {
    setList((prev) => prev.filter((e) => entryKey(e) !== entryKey(entry)));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/vendors/${id}/coverage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onsite, walkin }),
      });
      const json = await res.json();
      setMessage(json.success ? "Coverage saved." : json.error || "Failed to save.");
    } catch {
      setMessage("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-surface-2 flex items-center justify-center text-sm text-ink-3">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-surface-2 text-ink">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-start gap-4 mb-8">
          <button
            onClick={() => router.push(`/console/admin/vendors/${id}`)}
            className="w-9 h-9 rounded-card border border-border bg-surface flex items-center justify-center hover:bg-surface-2 transition shrink-0 mt-1"
          >
            <ArrowLeft className="w-4 h-4 text-ink-2" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Service Area Coverage</h1>
            <p className="text-sm text-ink-3 mt-1">{companyName}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-card p-5">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab("onsite")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeTab === "onsite" ? "bg-accent text-accent-fg" : "bg-surface-2 text-ink-3"
                }`}
              >
                Onsite Visits
              </button>
              <button
                onClick={() => setActiveTab("walkin")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  activeTab === "walkin" ? "bg-accent text-accent-fg" : "bg-surface-2 text-ink-3"
                }`}
              >
                Walk-in / Drop-off
              </button>
            </div>
            <p className="text-xs text-ink-3 mb-3">
              Assign coverage at whatever level makes sense — a whole state, a city, or individual pincodes.
            </p>
            <div className="max-h-[28rem] overflow-y-auto pr-1">
              {states.map((s) => (
                <StateNode
                  key={s}
                  state={s}
                  onAddState={(state) => addEntry({ level: "STATE", state })}
                  onAddCity={(state, city) => addEntry({ level: "CITY", state, city })}
                  onAddPincode={(state, city, pincode) => addEntry({ level: "PINCODE", state, city, pincode })}
                />
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-card p-5 space-y-6">
            <CoverageList title="Onsite Coverage" entries={onsite} onRemove={(e) => setOnsite((prev) => prev.filter((x) => entryKey(x) !== entryKey(e)))} />
            <CoverageList title="Walk-in Coverage" entries={walkin} onRemove={(e) => setWalkin((prev) => prev.filter((x) => entryKey(x) !== entryKey(e)))} />

            <div className="pt-4 border-t border-border">
              {message && <p className="text-xs text-ink-3 mb-2">{message}</p>}
              <button
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-card bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Coverage"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
