"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import WizardContainer from "@/components/vendor-product-wizard/WizardContainer";

/**
 * Was completely missing -- the products list's "Edit" link
 * (/vendor/products/[id]) pointed at a route that never existed, so every
 * click 404'd. A vendor had no way to resume or edit a draft after leaving
 * the wizard, only to start a brand-new one from scratch.
 */
export default function EditVendorProductPage() {
  const params = useParams();
  const draftId = params?.id as string;
  // Was never fetched -- WizardContainer's steps need businessId as a prop
  // (Category/Brand dropdowns, BOM's material search) and got it only on
  // /vendor/products/new (resolved from the session there). Resuming an
  // existing draft left every one of those blank with no obvious cause.
  const { data } = useSWR(draftId ? `/api/vendor-products/${draftId}` : null);
  const bId = data?.data?.businessId;
  const businessId: string | undefined = bId ? (typeof bId === "object" ? bId._id : bId) : undefined;

  if (!draftId) {
    return <div className="p-6 text-gray-500">Invalid product id.</div>;
  }

  return <WizardContainer draftId={draftId} businessId={businessId} />;
}
