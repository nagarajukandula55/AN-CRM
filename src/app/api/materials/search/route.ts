import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Material from "@/models/Material";
import { resolveVendorContext } from "@/lib/auth/vendorContext";

export async function GET(req: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    // Scoped to the calling vendor's own business -- was previously
    // global (every business's materials searchable by every vendor),
    // which both leaks other businesses' ingredient lists and risks
    // picking up a same-named material's price from the wrong business.
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    const ctx = userId ? await resolveVendorContext(userId) : null;
    const businessId = (ctx?.vendor as any)?.businessId;

    const query: Record<string, unknown> = {
      materialName: { $regex: q, $options: "i" },
      active: true,
    };
    if (businessId) query.businessId = businessId;

    const materials = await Material.find(query)
      .select("_id materialName materialCode stockUnit currentPrice materialType")
      .limit(20)
      .lean();

    // Material has no plain `unit` field (purchaseUnit/stockUnit/
    // consumptionUnit instead) -- selecting a nonexistent field name is a
    // silent no-op in Mongoose, so every caller of this search (BOM
    // material picker, both the wizard step and the standalone BOM page)
    // always got `unit: undefined` back, which then failed
    // VendorProductBOM's required `unit` field validation on save. Map to
    // the `unit` shape every consumer already expects.
    const data = materials.map((m: any) => ({
      _id: m._id,
      materialName: m.materialName,
      materialCode: m.materialCode,
      unit: m.stockUnit,
      currentPrice: m.currentPrice || 0,
      materialType: m.materialType,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}
