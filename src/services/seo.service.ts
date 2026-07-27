export function generateSEO(vendorProduct: any) {
  const name = vendorProduct.productName;
  const variant = vendorProduct.variantName;

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    variant.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const title = `${name} ${variant} | Buy Online at Best Price`;

  const description = `${name} ${variant} available with best quality, fast delivery and verified vendor pricing.`;

  const keywords = [
    name,
    variant,
    vendorProduct.brandId,
    vendorProduct.categoryId,
    "buy online",
    "best price",
  ];

  return {
    title,
    description,
    slug,
    keywords,
  };
}
