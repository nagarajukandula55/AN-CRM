"use client";

import React, { useEffect, useState } from "react";

/**
 * Lets a Super Admin pick, per business, which saved DocumentTemplate
 * (built in Admin > Document Templates) is the one this business's
 * Invoice/Estimate/Work Order prints actually use. "Selecting" a template
 * here just marks it isDefault:true for that businessId+documentType --
 * the same flag /api/document-templates/resolve already reads to pick the
 * effective template at print time (see core/documentTemplates/resolve.ts),
 * so no new resolution logic is needed, only this picker UI.
 */

const DOC_TYPES: { key: string; label: string }[] = [
  { key: "INVOICE", label: "Invoice" },
  { key: "ESTIMATE", label: "Estimate" },
  { key: "WORK_ORDER", label: "Work Order / Service Order" },
  { key: "SERVICE_RECORD", label: "Service Record" },
];

interface Template {
  _id: string;
  name: string;
  isDefault: boolean;
}

export default function DocumentTemplateSelectorPanel({ businessId }: { businessId: string }) {
  const [templatesByType, setTemplatesByType] = useState<Record<string, Template[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/document-templates?businessId=${businessId}`);
      const d = await res.json();
      if (d.success) {
        const grouped: Record<string, Template[]> = {};
        for (const t of d.templates || []) {
          if (!grouped[t.documentType]) grouped[t.documentType] = [];
          grouped[t.documentType].push(t);
        }
        setTemplatesByType(grouped);
      }
    } catch {
      setMessage("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function selectDefault(docType: string, templateId: string) {
    setSaving(docType);
    setMessage("");
    try {
      const res = await fetch(`/api/document-templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const d = await res.json();
      if (d.success) {
        setMessage("Saved.");
        await load();
      } else {
        setMessage(d.error || "Failed to save.");
      }
    } catch {
      setMessage("Failed to save.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="space-y-4">
      {message && <p className="text-xs text-gray-500">{message}</p>}
      {DOC_TYPES.map(({ key, label }) => {
        const options = templatesByType[key] || [];
        const current = options.find((t) => t.isDefault)?._id || "";
        return (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            {options.length === 0 ? (
              <span className="text-xs text-gray-400">
                No templates built yet -- create one in Admin &gt; Document Templates.
              </span>
            ) : (
              <select
                value={current}
                disabled={saving === key}
                onChange={(e) => selectDefault(key, e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              >
                <option value="" disabled>
                  Select a template…
                </option>
                {options.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
