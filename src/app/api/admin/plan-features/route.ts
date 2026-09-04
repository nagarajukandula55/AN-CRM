/**
 * GET  /api/admin/plan-features — every mode/plan combo with its currently
 *      effective moduleKeys (DB override if one exists, else the static
 *      default from core/pricing/plans.ts) plus the full catalog of
 *      taggable keys (every STATIC_MODULES key + the synthetic
 *      "telegram-reports" feature) for the matrix UI to render checkboxes
 *      against.
 * PUT  /api/admin/plan-features — upsert the moduleKeys override for one
 *      mode/plan. Super Admin only -- this is a platform-wide pricing/
 *      packaging decision, not a per-business setting.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PlanFeatureConfig from "@/models/PlanFeatureConfig";
import PricingSettings from "@/models/PricingSettings";
import { ALL_PLANS, PLANS_BY_MODE, LAUNCH_PRICING_CUTOVER, type OperatingMode, type PlanKey } from "@/core/pricing/plans";
import { STATIC_MODULES } from "@/components/sidebar-nav";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { VENDOR_MODULE_KEYS } from "@/core/access/vendorAccess.service";

const SYNTHETIC_FEATURE_KEYS = [
  { key: "telegram-reports", label: "Automatic Telegram Business Report" },
];

export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }

    await connectDB();
    const overrides = await PlanFeatureConfig.find({}).lean();
    const overrideMap = new Map(overrides.map((o: any) => [`${o.mode}:${o.plan}`, o]));

    const plans = ALL_PLANS.map((p) => {
      const o: any = overrideMap.get(`${p.mode}:${p.key}`);
      return {
        mode: p.mode,
        plan: p.key,
        name: p.name,
        moduleKeys: o?.moduleKeys ?? p.moduleKeys,
        // vendorModuleKeys -- what api/vendor/billing/subscribe actually
        // reads to populate a paying vendor's VendorSubscription.modules,
        // a DIFFERENT vocabulary from moduleKeys above (see
        // PlanFeatureConfig.vendorModuleKeys's own comment).
        vendorModuleKeys: o?.vendorModuleKeys?.length ? o.vendorModuleKeys : p.vendorModuleKeys,
        monthlyPriceINR: o?.monthlyPriceINR ?? p.monthlyPriceINR,
        seatLimit: o?.seatLimit ?? p.seatLimit,
        freeTrialDays: o?.freeTrialDays ?? p.freeTrialDays ?? 0,
        isOverridden: !!o,
      };
    });

    const catalog = [
      ...STATIC_MODULES.map((m: any) => ({ key: m.key, label: m.label })),
      ...SYNTHETIC_FEATURE_KEYS,
    ];
    // Vendor-portal-only catalog, labeled from the same STATIC_MODULES
    // catalog where a matching entry exists, falling back to the raw key.
    const staticLabelByKey = new Map(STATIC_MODULES.map((m: any) => [m.key, m.label]));
    const vendorCatalog = VENDOR_MODULE_KEYS.map((key) => ({ key, label: staticLabelByKey.get(key) || key }));

    // Global launch->standard cutover -- one shared date, not per-plan
    // (see PricingSettings' own comment). Falls back to the compiled
    // default from plans.ts when no override has been saved.
    const pricingSettings = await PricingSettings.findById("global").select("launchCutover").lean<any>();
    const launchCutoverISO = (pricingSettings?.launchCutover ? new Date(pricingSettings.launchCutover) : LAUNCH_PRICING_CUTOVER).toISOString();

    return NextResponse.json({ success: true, plans, catalog, vendorCatalog, modesOrder: Object.keys(PLANS_BY_MODE), launchCutoverISO });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// POST /api/admin/plan-features — update the GLOBAL launch->standard
// cutover date (PricingSettings singleton), separate from PUT above
// (which is always scoped to one mode/plan). Super Admin only.
export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }
    const body = await req.json();
    const { launchCutover } = body as { launchCutover?: string };
    if (!launchCutover || Number.isNaN(new Date(launchCutover).getTime())) {
      return NextResponse.json({ success: false, message: "A valid launchCutover date is required" }, { status: 400 });
    }

    await connectDB();
    await PricingSettings.findByIdAndUpdate(
      "global",
      { $set: { launchCutover: new Date(launchCutover), updatedBy: session.user?.id } },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Super Admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { mode, plan, moduleKeys, vendorModuleKeys, monthlyPriceINR, seatLimit, freeTrialDays } = body as {
      mode: OperatingMode;
      plan: PlanKey;
      moduleKeys: string[];
      vendorModuleKeys?: string[];
      monthlyPriceINR?: number;
      seatLimit?: string;
      freeTrialDays?: number;
    };
    if (!mode || !plan || !Array.isArray(moduleKeys)) {
      return NextResponse.json({ success: false, message: "mode, plan and moduleKeys[] are required" }, { status: 400 });
    }

    await connectDB();
    const set: Record<string, unknown> = { moduleKeys, updatedBy: session.user?.id };
    if (Array.isArray(vendorModuleKeys)) set.vendorModuleKeys = vendorModuleKeys;
    if (monthlyPriceINR !== undefined && monthlyPriceINR !== null && monthlyPriceINR !== ("" as unknown)) {
      set.monthlyPriceINR = Number(monthlyPriceINR);
    }
    if (seatLimit !== undefined) set.seatLimit = seatLimit;
    if (freeTrialDays !== undefined && freeTrialDays !== null && freeTrialDays !== ("" as unknown)) {
      set.freeTrialDays = Number(freeTrialDays);
    }
    await PlanFeatureConfig.findOneAndUpdate(
      { mode, plan },
      { $set: set },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
