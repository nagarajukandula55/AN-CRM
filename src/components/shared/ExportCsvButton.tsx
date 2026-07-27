"use client";

import { Download } from "lucide-react";
import { downloadCsv, type CsvColumn } from "@/lib/csvExport";

export default function ExportCsvButton<T>({
  filename,
  columns,
  rows,
  className,
}: {
  filename: string;
  columns: CsvColumn<T>[];
  rows: T[];
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, columns, rows)}
      disabled={rows.length === 0}
      title={rows.length === 0 ? "Nothing to export yet" : "Download this list as CSV"}
      className={
        className ||
        "flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
      }
    >
      <Download className="w-4 h-4" /> Export CSV
    </button>
  );
}
