"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DesignerCanvas from "@/components/designer/DesignerCanvas";

export default function EditDesignPage() {
  const params = useParams();
  const { id } = params;

  const [design, setDesign] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadDesign() {
    try {
      const res = await fetch(`/api/designs/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load design");
      }

      setDesign(data);
    } catch (err) {
      console.error(err);
      setDesign(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadDesign();
  }, [id]);

  if (loading) {
    return <div className="p-6">Loading design...</div>;
  }

  if (!design) {
    return <div className="p-6">Design not found</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">
        Editing: {design.name}
      </h1>

      <DesignerCanvas
        labelWidth={design.width}
        labelHeight={design.height}
        designId={design._id}
        initialCanvas={design.canvasJson}
      />
    </div>
  );
}
