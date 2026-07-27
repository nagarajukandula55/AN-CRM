"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import WizardContainer from "@/components/vendor-product-wizard/WizardContainer";

export default function NewVendorProductPage() {
  const searchParams = useSearchParams();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // Reset so the "Creating product draft..." loading state shows again
      // and WizardContainer (keyed on draftId below) fully remounts -- was
      // an empty-deps effect that only ever ran once per page LOAD, so
      // "+ Create another variant" on Review (router.push to this same
      // route with a different ?cloneFromDraftId=) changed the URL but
      // never actually created or loaded the new draft: Next.js keeps this
      // component instance alive across a same-route navigation, and the
      // effect below simply never re-ran to notice the new query param.
      setDraftId(null);
      setError(null);

      // Super admins have no personal activeBusinessId (they aren't a member
      // of any single business) -- honor an explicit ?businessId= passed in
      // from the calling page (e.g. admin/products, which already knows
      // which business it's viewing) before falling back to the user's own
      // active business. Was also reading `me.activeBusinessId`, but the
      // /api/auth/me response actually nests it under `me.user.activeBusinessId`
      // -- that mismatch meant this always fell through to the missing-
      // business error, even for a normal vendor with a real active business.
      const queryBusinessId = searchParams.get("businessId") || undefined;

      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const activeBusinessId: string | undefined =
        queryBusinessId || me?.user?.activeBusinessId || undefined;
      setBusinessId(activeBusinessId);

      const cloneFromDraftId = searchParams.get("cloneFromDraftId") || undefined;
      const res = await fetch("/api/vendor-products/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: activeBusinessId, cloneFromDraftId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(
          data.message ||
            "Failed to start a new product draft — please try again."
        );
        return;
      }

      setDraftId(data.id);
    }

    init();
  }, [searchParams]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!draftId) {
    return (
      <div className="p-6 text-gray-500">
        Creating product draft...
      </div>
    );
  }

  // Keyed on draftId so WizardContainer fully remounts (step resets to 1,
  // no leftover state from whatever draft was being edited before) when a
  // new draft is created under this same route -- see the effect above.
  return <WizardContainer key={draftId} draftId={draftId} businessId={businessId} />;
}
