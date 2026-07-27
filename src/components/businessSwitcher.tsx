"use client";

import { useEffect, useState } from "react";

export default function BusinessSwitcher() {
  const [businesses, setBusinesses] = useState<any[]>(
    []
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/businesses/list");
    const data = await res.json();

    if (data.success) setBusinesses(data.businesses);
  }

  function switchBusiness(id: string) {
    localStorage.setItem("businessId", id);
    window.location.reload();
  }

  return (
    <select
      onChange={(e) =>
        switchBusiness(e.target.value)
      }
      className="bg-black text-white p-2 rounded"
    >
      {businesses.map((b) => (
        <option key={b._id} value={b._id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
