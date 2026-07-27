"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StepSubmitProps {
  draftId: string;
  back: () => void;
}

export default function StepSubmit({ draftId, back }: StepSubmitProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor-products/${draftId}/submit`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(
          data.message ||
            "Failed to submit — please make sure a Bill of Materials has been added"
        );
        return;
      }

      setDone(true);
    } catch {
      setError("Failed to connect to server");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center py-8">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold">Submitted for Review</h2>
        <p className="text-sm text-gray-500">
          Your product has been submitted and pricing is now frozen pending
          admin approval. You&apos;ll be notified once it&apos;s reviewed.
        </p>
        <button
          onClick={() => router.push("/vendor/products")}
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Back to My Products
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Submit for Approval</h2>
      <p className="text-sm text-gray-500">
        Once submitted, pricing and structure will be frozen and an admin
        will review your product. Make sure the Bill of Materials step is
        complete before continuing — submission is blocked otherwise.
      </p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button onClick={back} className="rounded border px-4 py-2">
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded bg-purple-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Product"}
        </button>
      </div>
    </div>
  );
}
