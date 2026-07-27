"use client";

/**
 * Admin page for managing the India pincode dataset that powers
 * PincodeInput's autofill (src/components/shared/LocationSelect.tsx).
 *
 * The dataset is stored in MongoDB (PincodeEntry collection), not a
 * bundled static file — this app deploys on Vercel, whose filesystem is
 * read-only at runtime, so a file-based dataset could never be refreshed
 * from the UI in production. See src/models/PincodeEntry.ts for the full
 * reasoning. This page lets an admin upload a fresh CSV export (same
 * format as the official India Post "All India Pincode Directory") any
 * time a newer version is released, without needing a code deploy.
 */
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Download } from "lucide-react";

// Matches exactly what the upload handler expects (see this page's own
// "Expected columns" note below and api/admin/pincode-data's parser).
function downloadTemplate() {
  const rows = [
    "pincode,district,statename,officename",
    "560001,Bangalore,Karnataka,Bangalore GPO",
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pincode-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface DatasetStatus {
  totalPincodes: number;
  lastUpload: {
    sourceFileName?: string;
    uploadedAt?: string;
    totalPincodes?: number;
  } | null;
}

export default function PincodeDataPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { data: statusData, isLoading: loading, mutate: loadStatus } = useSWR(
    "/api/admin/pincode-data",
    { fetcher: (url: string) => fetch(url).then(parseJsonResponse) }
  );
  const status: DatasetStatus | null = statusData?.success
    ? { totalPincodes: statusData.totalPincodes, lastUpload: statusData.lastUpload }
    : null;
  // The server may reject an oversized request before our code ever runs
  // (platform body-size limit) and respond with a plain-text body like
  // "Request Entity Too Large" instead of JSON — res.json() throws a
  // SyntaxError on that, which used to surface as a raw, confusing parse
  // error. Read as text first and parse defensively so every failure path
  // produces a readable message instead.
  async function parseJsonResponse(res: Response): Promise<any> {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (res.status === 413) {
        throw new Error("This chunk was too large for the server to accept. Try again — it should be split into smaller pieces automatically.");
      }
      throw new Error(text?.slice(0, 200) || `Server error (${res.status})`);
    }
  }

  // Splits the CSV into line-based chunks well under the server's per-chunk
  // limit (4MB) and Vercel's serverless request-body cap (~4.5MB) — the
  // official India Post directory export is ~23MB, far too large for a
  // single request. Each chunk keeps the header line so the server's CSV
  // parser (shared with the one-shot path) works unchanged per chunk.
  const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

  function splitCsvIntoChunks(csvText: string): string[] {
    const lines = csvText.split(/\r\n|\n|\r/);
    if (lines.length === 0) return [];
    const header = lines[0];
    const chunks: string[] = [];
    let current: string[] = [header];
    let currentBytes = new Blob([header]).size;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const lineBytes = new Blob([line]).size + 1;
      if (currentBytes + lineBytes > MAX_CHUNK_BYTES && current.length > 1) {
        chunks.push(current.join("\n"));
        current = [header];
        currentBytes = new Blob([header]).size;
      }
      current.push(line);
      currentBytes += lineBytes;
    }
    if (current.length > 1) chunks.push(current.join("\n"));
    return chunks;
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const csvText = await file.text();
      const chunks = file.size > MAX_CHUNK_BYTES ? splitCsvIntoChunks(csvText) : [csvText];
      if (chunks.length === 0) {
        throw new Error("The file appears to be empty");
      }

      let totalRows = 0;
      let skippedRows = 0;
      let totalPincodes = 0;

      for (let i = 0; i < chunks.length; i++) {
        setUploadProgress(chunks.length > 1 ? `Uploading part ${i + 1} of ${chunks.length}…` : null);
        const blob = new Blob([chunks[i]], { type: "text/csv" });
        const formData = new FormData();
        formData.append("file", blob, file.name);
        formData.append("append", i > 0 ? "true" : "false");
        formData.append("isFinal", i === chunks.length - 1 ? "true" : "false");

        const res = await fetch("/api/admin/pincode-data", {
          method: "POST",
          body: formData,
        });
        const data = await parseJsonResponse(res);
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Upload failed on part ${i + 1} of ${chunks.length}`);
        }
        totalRows += data.totalRows || 0;
        skippedRows += data.skippedRows || 0;
        if (data.totalPincodes != null) totalPincodes = data.totalPincodes;
      }

      setResult(
        `Loaded ${totalPincodes.toLocaleString()} pincodes from ${totalRows.toLocaleString()} rows` +
          (skippedRows ? ` (${skippedRows.toLocaleString()} invalid rows skipped)` : "")
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin"
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            ←
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Pincode Data</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Manage the India pincode → state/city dataset used for address autofill
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        {result && (
          <div className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            {result}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="font-medium text-gray-900 mb-4">Current Dataset</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Pincodes loaded</p>
                <p className="text-xl font-semibold text-gray-900">
                  {status?.totalPincodes?.toLocaleString() ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Last updated</p>
                <p className="text-sm text-gray-700">
                  {status?.lastUpload?.uploadedAt
                    ? new Date(status.lastUpload.uploadedAt).toLocaleString()
                    : "Never uploaded"}
                </p>
                {status?.lastUpload?.sourceFileName && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    from {status.lastUpload.sourceFileName}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-gray-900">Upload New Dataset</h2>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:text-gray-900 hover:border-gray-400 transition"
            >
              <Download size={12} /> Download Template
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Upload the latest{" "}
            <a
              href="https://www.data.gov.in/catalog/all-india-pincode-directory"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-700 hover:underline"
            >
              All India Pincode Directory
            </a>{" "}
            CSV export from India Post / data.gov.in. This will replace the entire dataset —
            existing pincodes not present in the new file will be removed.
          </p>

          <label
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition ${
              uploading ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <span className="text-sm font-medium text-gray-700">
              {uploading ? (uploadProgress || "Processing…") : "Click to select a CSV file"}
            </span>
            <span className="text-xs text-gray-400">
              Expected columns: pincode, district, statename, officename
            </span>
            <span className="text-xs text-gray-400">
              CSV only, any size — large files (e.g. the ~23MB official India Post export) are
              automatically split into ≤4MB chunks and uploaded in sequence.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
