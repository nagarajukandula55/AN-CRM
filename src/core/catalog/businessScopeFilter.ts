/**
 * The one $or clause every business-tagged catalog list route (Brand,
 * ProductCategory, MaterialCategory, FaultCode, Solution) uses to decide
 * which records a given business can see: its own (SINGLE, via businessId),
 * anything explicitly shared with it (MULTIPLE, via businessIds), or
 * anything shared with everyone (ALL). Written once here instead of
 * reimplementing the same $or four+ times.
 */
export function buildBusinessScopeQuery(
  businessId: string,
  opts: { includeNullFallback?: boolean } = {}
) {
  const clauses: Record<string, unknown>[] = [
    { businessId },
    { businessScope: "ALL" },
    { businessScope: "MULTIPLE", businessIds: businessId },
  ];
  // FaultCode (and Solution) also fall back to platform-seeded records with
  // businessId: null -- a separate, older convention this helper preserves
  // rather than replaces.
  if (opts.includeNullFallback) clauses.push({ businessId: null });
  return { $or: clauses };
}
