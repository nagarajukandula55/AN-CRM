"use client";

import dynamic from "next/dynamic";

// DesignEditor touches Fabric.js (browser-only) — loaded with ssr:false so
// Next.js never attempts to render/prerender it on the server.
const DesignEditor = dynamic(() => import("@/components/design-studio/DesignEditor"), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-gray-500 text-sm">Loading editor…</div>,
});

export default function NewDesignPage() {
  return <DesignEditor />;
}
