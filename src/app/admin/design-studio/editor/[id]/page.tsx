"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const DesignEditor = dynamic(() => import("@/components/design-studio/DesignEditor"), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-gray-500 text-sm">Loading editor…</div>,
});

// /admin/design-studio/editor/[id] — loads and edits an existing design.
// Pass ?fromTemplate=true to instead treat [id] as a shared template to
// duplicate first (used by the Templates gallery's "Use Template" action
// before that button was wired to call the duplicate API itself — kept as
// a supported entry point either way).
export default function EditDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const fromTemplate = searchParams.get("fromTemplate") === "true";

  return fromTemplate ? (
    <DesignEditor duplicateFromTemplateId={id} />
  ) : (
    <DesignEditor designId={id} />
  );
}
