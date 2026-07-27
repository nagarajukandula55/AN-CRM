/**
 * Generic client-side CSV export -- no server round-trip, works on any
 * array of flat-ish objects already loaded into a page's state. Used
 * across every vendor-facing list view (Products, Orders, Warehouses,
 * Invoices, Inventory, Offline Sales) per explicit requirement that every
 * view offer a CSV download of its data.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const headerLine = columns.map((c) => csvEscape(c.header)).join(",");
  const dataLines = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(","));
  const csv = [headerLine, ...dataLines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
