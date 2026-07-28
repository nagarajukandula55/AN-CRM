import { crmFetch } from "./client";

export interface Material {
  _id: string;
  partCode: string;
  partName: string;
  partType: "SPARE_PART" | "LABOUR" | "CONSUMABLE";
  hsnCode: string;
  gstRate: number;
  rate: number;
  isSerialized: boolean;
}

export async function listMaterials(search?: string): Promise<Material[]> {
  const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  const data = await crmFetch(`/api/service-center-bom${qs}`);
  return data.parts || data.data || [];
}
