import Business from "@/models/Business";

/**
 * Resolves business context for every request
 * Future-proof: supports multi-tenant scaling
 */
export async function resolveBusiness(req: Request) {
  // Option 1: header-based (future mobile apps / admin panels)
  const businessHeader = req.headers.get("x-business-id");

  if (businessHeader) {
    const business = await Business.findById(businessHeader);
    if (business) return business;
  }

  // Option 2: default fallback (ONLY for dev/testing)
  const defaultBusiness = await Business.findOne({ isDefault: true });

  return defaultBusiness;
}
