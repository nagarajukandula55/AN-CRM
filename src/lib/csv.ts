/**
 * Minimal dependency-free CSV parser — no csv-parse/papaparse package is
 * installed (and the sandbox this was built in has npm registry access
 * blocked, so a new dependency couldn't be added even if desired). Handles
 * the standard RFC 4180 shape the India Post pincode directory export
 * uses: comma-separated fields, double-quoted fields that may contain
 * commas, and "" as an escaped quote inside a quoted field. Does not
 * support embedded newlines inside quoted fields (not present in the
 * source data this was built against) — if that's ever needed, swap this
 * for a real library once npm access is available.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const lines = text.split(/\r\n|\n|\r/);

  for (const line of lines) {
    if (!inQuotes && field === "" && row.length === 0 && line.trim() === "") {
      continue; // skip blank lines between records
    }

    let i = 0;
    while (i < line.length) {
      const ch = line[i];

      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }

    if (inQuotes) {
      // A real embedded newline inside a quoted field — not expected in
      // this dataset, but handle gracefully by keeping the newline and
      // continuing to accumulate rather than corrupting the row.
      field += "\n";
      continue;
    }

    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  }

  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Parses CSV text into an array of objects keyed by the header row. */
export function parseCSVToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? "").trim();
    });
    return obj;
  });
}
