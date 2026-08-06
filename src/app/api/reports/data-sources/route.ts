/**
 * GET /api/reports/data-sources -- available report data sources + fields,
 * merged with central-api's admin-configurable overrides (hide a field,
 * rename its label). The underlying model + base field allowlist stays
 * code-defined in core/reports/dataSources.ts for safety (see that
 * override's own comment in central-api's routes/reportFieldConfig.js) --
 * this only narrows/relabels what's already there, never widens it.
 */
import { NextResponse } from "next/server";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { DATA_SOURCES } from "@/core/reports/dataSources";
import { resolveCentralBusinessId } from "@/lib/centralApiRead";

const CENTRAL_API_URL = process.env.CENTRAL_API_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;
const APP_NAME = "an-crm";

async function getFieldOverrides(dataSource: string, businessId?: string) {
  if (!CENTRAL_API_URL) return { disabledFieldKeys: [] as string[], labelOverrides: {} as Record<string, string> };
  try {
    const centralBusinessId = businessId ? await resolveCentralBusinessId(businessId) : null;
    const qs = centralBusinessId ? `?businessId=${encodeURIComponent(centralBusinessId)}` : "";
    const res = await fetch(`${CENTRAL_API_URL}/api/v1/report-field-config/${APP_NAME}/${dataSource}${qs}`, {
      headers: { "x-api-key": CENTRAL_API_KEY || "" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    return { disabledFieldKeys: body.disabledFieldKeys || [], labelOverrides: body.labelOverrides || {} };
  } catch (err) {
    console.error(`[reports/data-sources] override fetch failed for ${dataSource}:`, (err as any)?.message || err);
    return { disabledFieldKeys: [] as string[], labelOverrides: {} as Record<string, string> };
  }
}

export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const businessId = session.business?.businessId ? String(session.business.businessId) : undefined;

    const sources = await Promise.all(
      Object.entries(DATA_SOURCES).map(async ([key, def]) => {
        const { disabledFieldKeys, labelOverrides } = await getFieldOverrides(key, businessId);
        const fields = def.fields
          .filter((f) => !disabledFieldKeys.includes(f.key))
          .map((f) => ({ ...f, label: labelOverrides[f.key] || f.label }));
        return { key, label: def.label, dateField: def.dateField, fields };
      })
    );

    return NextResponse.json({ success: true, sources });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
