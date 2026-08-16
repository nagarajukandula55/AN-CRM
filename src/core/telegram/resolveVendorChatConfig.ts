import VendorProfile from "@/models/VendorProfile";

export interface VendorChatConfig {
  vendorObjectId: string;
  vendorId: string;
  vendorName: string;
  businessId?: string;
  telegramChatId: string;
  telegramPersonalChatId: string;
  telegramReportFrequency: string;
  telegramMessageRouting: Record<string, { group?: boolean; personal?: boolean }>;
}

/**
 * Resolves a vendor's EFFECTIVE Telegram chat config -- its own, or (if
 * unset and it's a sub-vendor) its parent's, so a sub-vendor doesn't have
 * to link its own chat separately to start receiving alerts; it can still
 * override with its own /link at any time, which then wins.
 */
export async function resolveVendorChatConfig(vendorObjectId: string): Promise<VendorChatConfig | null> {
  const vendor = await VendorProfile.findById(vendorObjectId)
    .select("vendorId companyName businessId parentVendorId telegramChatId telegramPersonalChatId telegramReportFrequency telegramMessageRouting")
    .lean<any>();
  if (!vendor) return null;

  let group = vendor.telegramChatId || "";
  let personal = vendor.telegramPersonalChatId || "";
  let frequency = vendor.telegramReportFrequency || "NONE";
  let routing = vendor.telegramMessageRouting || {};

  if ((!group && !personal) && vendor.parentVendorId) {
    const parent = await VendorProfile.findById(vendor.parentVendorId)
      .select("telegramChatId telegramPersonalChatId telegramReportFrequency telegramMessageRouting")
      .lean<any>();
    if (parent) {
      group = parent.telegramChatId || "";
      personal = parent.telegramPersonalChatId || "";
      if (frequency === "NONE") frequency = parent.telegramReportFrequency || "NONE";
      if (Object.keys(routing).length === 0) routing = parent.telegramMessageRouting || {};
    }
  }

  return {
    vendorObjectId: String(vendor._id),
    vendorId: vendor.vendorId || "",
    vendorName: vendor.companyName || "",
    businessId: vendor.businessId ? String(vendor.businessId) : undefined,
    telegramChatId: group,
    telegramPersonalChatId: personal,
    telegramReportFrequency: frequency,
    telegramMessageRouting: routing,
  };
}
