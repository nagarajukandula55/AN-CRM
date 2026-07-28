"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";

interface Business {
  _id: string;
  name: string;
  legalName?: string;
  brandName?: string;
  businessCode?: string;
  brandShortcut?: string;
  industry?: string;
  type?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  isActive?: boolean;
  compliance?: { gstNumber?: string; pan?: string };
}

export default function BusinessListPage() {
  const router = useRouter();

  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // /api/auth/me returns businesses already scoped to what this user can
  // actually switch into (all active businesses for super admins, only
  // ACTIVE BusinessMember memberships otherwise) — the same source the
  // sidebar's business switcher uses. /api/businesses/list returns every
  // business in the system with no membership check, which would list
  // businesses here that /api/auth/switch-business then rejects with a
  // 403, so it's intentionally not used for this page.
  const { data: meData, isLoading: meLoading, error: meError } = useSWR("/api/auth/me");
  const isSuperAdmin = !!meData?.user?.isSuperAdmin;

  useEffect(() => {
    if (meData?.user) setActiveBusinessId(meData.user.activeBusinessId ?? null);
  }, [meData]);

  // /api/auth/me only ever returns active businesses (even for super
  // admins) -- inactive ones (soft-deleted, or seeded-inactive
  // placeholders) were completely invisible here, so there was no way to
  // even see, let alone reactivate, one. Only super admins can manage
  // activation, so only they fetch this.
  const {
    data: listData,
    isLoading: listLoading,
    mutate: refetchList,
  } = useSWR(isSuperAdmin ? "/api/businesses/list?includeInactive=true" : null);

  const businesses: Business[] = isSuperAdmin
    ? listData?.businesses ?? meData?.businesses ?? []
    : meData?.businesses ?? [];
  const loading = meLoading || (isSuperAdmin && listLoading);
  const loadError = meError ? "Failed to load businesses" : null;

  async function toggleActive(biz: Business) {
    if (togglingId) return;
    const nextActive = biz.isActive === false;
    if (!nextActive && biz._id === activeBusinessId) {
      setError("Switch to a different business before deactivating your currently active one.");
      return;
    }
    setTogglingId(biz._id);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${biz._id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to update business status");
        return;
      }
      refetchList((prev: any) =>
        prev?.businesses ? { ...prev, businesses: prev.businesses.map((b: Business) => (b._id === biz._id ? { ...b, isActive: nextActive } : b)) } : prev,
        false
      );
    } catch {
      setError("Failed to connect to server");
    } finally {
      setTogglingId(null);
    }
  }

  async function switchTo(biz: Business) {
    if (switchingId || biz._id === activeBusinessId) return;
    setSwitchingId(biz._id);
    try {
      const res = await fetch("/api/auth/switch-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: biz._id }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveBusinessId(biz._id);
        router.refresh();
      } else {
        setError(data.message || "Failed to switch business");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="px-6 py-10">
        <PageHeader
          eyebrow="Business"
          title="Businesses"
          description="Every business you manage in one place — switch between them or onboard a new one."
          actions={
            <Link href="/console/business/new">
              <Button icon={<Plus size={16} />}>Add Business</Button>
            </Link>
          }
        />

        {(error || loadError) && (
          <div className="mb-6 rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error || loadError}
          </div>
        )}

        {loading ? (
          <LoadingPanel label="Loading businesses…" />
        ) : businesses.length === 0 ? (
          <EmptyState
            kind="empty"
            title="No businesses yet"
            action={
              <Link href="/console/business/new">
                <Button icon={<Plus size={16} />}>Create your first one</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {businesses.map((biz) => {
              const isActive = biz._id === activeBusinessId;
              return (
                <Card
                  key={biz._id}
                  className={`p-5 flex flex-col gap-3 ${isActive ? "border-accent ring-2 ring-accent-soft" : "hover:border-border-strong"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-ink">{biz.name}</div>
                      {biz.brandName && <div className="text-xs text-ink-3">{biz.brandName}</div>}
                    </div>
                    {isActive && <Badge tone="info">Active</Badge>}
                    {!isActive && biz.isActive === false && <Badge tone="danger">Inactive</Badge>}
                  </div>

                  <div className="text-sm text-ink-3 space-y-1">
                    {biz.businessCode && (
                      <div>
                        Code: <span className="text-ink-2 tabular">{biz.businessCode}</span>
                        {biz.brandShortcut && (
                          <span className="ml-2 text-ink-3">
                            Brand Shortcut: <span className="text-ink-2 tabular">{biz.brandShortcut}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {(biz.industry || biz.type) && <div>{[biz.industry, biz.type].filter(Boolean).join(" · ")}</div>}
                    {biz.compliance?.gstNumber && <div>GST: {biz.compliance.gstNumber}</div>}
                    {(biz.city || biz.state) && <div>{[biz.city, biz.state].filter(Boolean).join(", ")}</div>}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => switchTo(biz)}
                      disabled={isActive || switchingId === biz._id}
                      className="flex-1"
                    >
                      {isActive ? "Currently Active" : switchingId === biz._id ? "Switching…" : "Switch to this business"}
                    </Button>
                    <Link href={`/console/business/${biz._id}`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                    {isSuperAdmin && (
                      <Button
                        variant={biz.isActive === false ? "success" : "danger"}
                        size="sm"
                        onClick={() => toggleActive(biz)}
                        disabled={togglingId === biz._id}
                        title={biz.isActive === false ? "Activate" : "Deactivate"}
                      >
                        {togglingId === biz._id ? "…" : biz.isActive === false ? "Activate" : "Deactivate"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
