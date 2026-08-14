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
import { ALL_PLANS, PLANS_BY_MODE, type OperatingMode, type PlanKey } from "@/core/pricing/plans";
import { STATIC_MODULES } from "@/components/sidebar-nav";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

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

    return NextResponse.json({ success: true, plans, catalog, modesOrder: Object.keys(PLANS_BY_MODE) });
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
    const { mode, plan, moduleKeys, monthlyPriceINR, seatLimit, freeTrialDays } = body as {
      mode: OperatingMode;
      plan: PlanKey;
      moduleKeys: string[];
      monthlyPriceINR?: number;
      seatLimit?: string;
      freeTrialDays?: number;
    };
    if (!mode || !plan || !Array.isArray(moduleKeys)) {
      return NextResponse.json({ success: false, message: "mode, plan and moduleKeys[] are required" }, { status: 400 });
    }

    await connectDB();
    const set: Record<string, unknown> = { moduleKeys, updatedBy: session.user?.id };
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
