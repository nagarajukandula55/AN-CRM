/**
 * Small dependency-free slugify helper — mirrors the CSV parser's rationale
 * elsewhere in this project (no slugify package installed, npm registry is
 * blocked in this sandbox), so this is intentionally minimal rather than
 * pulling in a library.
 */
export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Builds a working suggestion like "amul-butter-500g" from name + variant. */
export function suggestSlug(productName?: string, variantName?: string): string {
  const parts = [productName, variantName].filter(Boolean).join(" ");
  return slugify(parts);
}

/** Builds a short SEO title suggestion, capped to a sane length. */
export function suggestSeoTitle(productName?: string, variantName?: string, brandName?: string): string {
  const parts = [brandName, productName, variantName].filter(Boolean).join(" ");
  return parts.slice(0, 70);
}

/** Builds an SEO meta description suggestion from description text. */
export function suggestSeoDescription(description?: string, productName?: string): string {
  const base = (description || productName || "").replace(/\s+/g, " ").trim();
  return base.slice(0, 160);
}

/** Builds a starting-point product description from what's already known at
 * Basic Info time (name, category, brand) -- follows the big-marketplace
 * shape (headline line, scannable highlight bullets, a "perfect for" line)
 * so it reads as real ecommerce copy and gives search/AI-answer engines
 * (SEO + GEO) concrete, quotable claims to latch onto, instead of one dense
 * paragraph. Ingredients aren't known yet at this step (BOM comes later in
 * the wizard), so specifics stay as bracketed prompts the vendor fills in --
 * this is a strong starting draft, not a finished description. */
export function suggestDescription(productName?: string, categoryName?: string, brandName?: string): string {
  if (!productName) return "";
  const category = categoryName ? categoryName.toLowerCase() : "product";
  const brandLine = brandName ? `Brought to you by ${brandName}, ` : "";

  return [
    `${productName}${brandName ? ` by ${brandName}` : ""} — ${category} made the traditional way, with pure ingredients and no shortcuts.`,
    "",
    "Why you'll love it:",
    `• [Key ingredients — what goes into it]`,
    `• [Taste & texture — what makes it distinct]`,
    `• Made in small batches for consistent quality`,
    `• Carefully packed to lock in freshness`,
    "",
    "Perfect for: [everyday cooking / gifting / snacking — edit to fit]",
    "",
    `${brandLine}committed to quality and authenticity in every pack. Store in a cool, dry place.`,
  ].join("\n");
}

/** Builds SEO keyword suggestions from product name/category/brand. */
export function suggestSeoKeywords(
  productName?: string,
  categoryName?: string,
  brandName?: string
): string[] {
  const words = new Set<string>();
  [productName, categoryName, brandName]
    .filter(Boolean)
    .forEach((phrase) => {
      (phrase as string)
        .split(/\s+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 2)
        .forEach((w) => words.add(w));
    });
  return Array.from(words).slice(0, 10);
}
