"use client";

/**
 * Shared vendor detail popup used by both admin/vendors and
 * admin/masters/vendors list pages. Previously neither page had any
 * detail view at all — clicking a vendor row did nothing, and the only
 * action available was a bare "Approve" button wired to a generic PUT
 * with no rejection option, no audit trail, and no way to see or attach
 * bank-passbook/GST-certificate documents.
 *
 * This wires into the ALREADY-BUILT (but previously unused by any UI)
 * review flow: POST /api/vendors/[id]/review with
 * { action: "APPROVE" | "REJECT", reason? } — APPROVE generates a partner
 * Agreement and moves status to AGREEMENT_DRAFTED (the agreement exists
 * but hasn't been sent for signing yet); REJECT records a reason and moves
 * status to REJECTED. The actual AGREEMENT_SENT transition happens when an
 * admin sends the agreement from the Agreements screen (POST
 * /api/agreements/[id]/send).
 *
 * Once the vendor has signed (status AGREEMENT_SIGNED), this modal now also
 * exposes a "Final Approve & Create Login" action wired to the
 * already-built (but, until now, never called from any UI) POST
 * /api/vendors/[id]/finalize — this is what actually creates the vendor's
 * User login and moves them to ACTIVE. Previously that endpoint existed
 * with no button anywhere to trigger it, so no vendor could ever actually
 * receive login access after signing.
 */
import { useState, useEffect } from "react";
import { X, Loader2, FileText, CheckCircle, XCircle, Building2 } from "lucide-react";

export interface VendorDetailData {
  _id: string;
  vendorId?: string;
  requestNumber?: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  gstRegistered?: boolean;
  panNumber?: string;
  category?: string;
  businessType?: string;
  paymentTerms?: string;
  creditLimit?: number;
  rating?: number;
  status?: string;
  isApproved?: boolean;
  businessId?: string | { _id: string; name?: string; legalName?: string; brandName?: string };
  address?: { street?: string; city?: string; state?: string; pincode?: string };
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  documents?: {
    passbookUrl?: string;
    passbookUploadedAt?: string;
    gstCertificateUrl?: string;
    gstCertificateUploadedAt?: string;
    // `label` is only set for admin-added ad-hoc docs (via "Add another
    // document" below) so the modal can re-render a human-readable name
    // for the field without having to lossily decode it from the key.
    compliance?: Record<string, { url?: string; uploadedAt?: string; number?: string; label?: string }>;
  };
  rejectionReason?: string;
  notes?: string;
  enableStoreFront?: boolean;
  enableServiceCenter?: boolean;
  enableWarehouse?: boolean;
}

interface VendorDetailModalProps {
  vendor: VendorDetailData;
  onClose: () => void;
  /** Called after a successful approve/reject/document-upload so the parent list can refresh. */
  onUpdated: (updated: Partial<VendorDetailData>) => void;
}

const REVIEWABLE_STATUSES = ["APPLIED", "PENDING"];

function businessLabel(businessId: VendorDetailData["businessId"]): string {
  if (!businessId) return "—";
  if (typeof businessId === "string") return businessId;
  return businessId.brandName || businessId.legalName || businessId.name || businessId._id;
}

export function VendorDetailModal({ vendor, onClose, onUpdated }: VendorDetailModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Documents are only ever uploaded at application/creation time (vendor
  // onboarding form or the public vendor-apply signup, both wired to
  // core/vendorCompliance.ts's required/optional doc lists) -- this modal
  // is a review step, so it only reads what's already in vendor.documents,
  // never writes to it.
  const documents = vendor.documents || {};
  const extraDocs = Object.entries(vendor.documents?.compliance || {})
    .filter(([k]) => k !== "msme_certificate")
    .map(([k, v]) => ({ key: k, label: v?.label || k.replace(/_/g, " ") }));
  // A general (business-agnostic) signup request arrives with no
  // businessId — the admin must pick one here before it can be approved.
  const [assignBusinessId, setAssignBusinessId] = useState("");
  const [businessOptions, setBusinessOptions] = useState<{ _id: string; name: string; brandName?: string }[]>([]);

  const canReview = REVIEWABLE_STATUSES.includes(vendor.status || "PENDING");
  const canFinalize = vendor.status === "AGREEMENT_SIGNED";
  // Previously any vendor whose agreement got cancelled (DELETE
  // /api/agreements/[id], which now sets status to AGREEMENT_CANCELLED —
  // see that route's comment) had NO visible action here: canReview only
  // covers APPLIED/PENDING and canFinalize only covers AGREEMENT_SIGNED,
  // so the modal rendered no buttons at all for this state — a dead end.
  // "Restart Review" sends the vendor back to PENDING so admin can
  // re-approve and generate a fresh agreement.
  const canRestartReview = vendor.status === "AGREEMENT_CANCELLED";
  const [restarting, setRestarting] = useState(false);
  const needsBusinessAssignment = !vendor.businessId;
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{ email: string; temporaryPassword: string | null } | null>(null);

  // Only a super admin can add staff to ANY vendor from this admin-side
  // modal (see /api/admin/vendor-staff) — a regular admin does not get
  // this section. Vendors add their own staff from their own portal
  // (/vendor/staff, via /api/vendor/staff) regardless of this flag.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [staffUsername, setStaffUsername] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);

  // Store Front / Service Center / Warehouse facility toggles — independent
  // of each other. Drives which memberType staff roles are relevant for
  // this vendor (see BusinessMember.ts / /vendor/staff page).
  const [facilities, setFacilities] = useState({
    enableStoreFront: !!vendor.enableStoreFront,
    enableServiceCenter: !!vendor.enableServiceCenter,
    enableWarehouse: !!vendor.enableWarehouse,
  });
  const [savingFacility, setSavingFacility] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setIsSuperAdmin(!!d.user?.isSuperAdmin);
        if (needsBusinessAssignment) setBusinessOptions(d.businesses || []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleFacility(key: "enableStoreFront" | "enableServiceCenter" | "enableWarehouse") {
    const nextValue = !facilities[key];
    setSavingFacility(key);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendor._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to update facility setting");
      setFacilities((prev) => ({ ...prev, [key]: nextValue }));
      onUpdated({ [key]: nextValue });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingFacility(null);
    }
  }

  async function handleAddStaff() {
    if (!staffUsername.trim() || !staffRole.trim()) {
      setStaffMessage("Enter both a user ID and a role");
      return;
    }
    setAddingStaff(true);
    setStaffMessage(null);
    try {
      const res = await fetch("/api/admin/vendor-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: staffUsername.trim(), vendorId: vendor._id, vendorRole: staffRole.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add staff member");
      setStaffMessage("Staff member added.");
      setStaffUsername("");
      setStaffRole("");
    } catch (err) {
      setStaffMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAddingStaff(false);
    }
  }

  async function handleReview(action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !rejectReason.trim()) {
      setShowRejectBox(true);
      setError("Please provide a reason for rejection");
      return;
    }
    if (action === "APPROVE" && needsBusinessAssignment && !assignBusinessId) {
      setError("Select which business this vendor is being onboarded under before approving");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendor._id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "REJECT" ? rejectReason.trim() : undefined,
          businessId: action === "APPROVE" && needsBusinessAssignment ? assignBusinessId : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${action.toLowerCase()} vendor`);
      }
      onUpdated({
        status: data.vendor?.status,
        rejectionReason: data.vendor?.rejectionReason,
        businessId: data.vendor?.businessId,
        vendorId: data.vendor?.vendorId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendor._id}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to finalize vendor");
      setFinalizeResult({
        email: data.login?.email,
        temporaryPassword: data.login?.temporaryPassword ?? null,
      });
      onUpdated({ status: data.vendor?.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleRestartReview() {
    setRestarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendor._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PENDING" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to restart review");
      onUpdated({ status: "PENDING" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRestarting(false);
    }
  }

  const rowCls = "flex justify-between py-2 border-b border-gray-100 last:border-0";
  const labelCls = "text-xs text-gray-400";
  const valueCls = "text-sm text-gray-900 font-medium";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white border-l border-gray-200 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{vendor.companyName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {vendor.vendorId || vendor.requestNumber || "No vendor ID assigned yet"} · Status: {vendor.status || "PENDING"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {vendor.status === "REJECTED" && vendor.rejectionReason && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <strong>Rejected:</strong> {vendor.rejectionReason}
            </div>
          )}

          {vendor.status === "AGREEMENT_CANCELLED" && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <strong>Agreement cancelled.</strong> The agreement sent to this vendor was cancelled before signing. Use &quot;Restart Review&quot; below to send them back through approval and generate a fresh agreement.
            </div>
          )}

          {/* Business tag — which business this vendor is being onboarded into */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Onboarding Business
            </h3>
            {needsBusinessAssignment ? (
              <div className="space-y-1.5">
                <select
                  value={assignBusinessId}
                  onChange={(e) => setAssignBusinessId(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 transition appearance-none"
                >
                  <option value="">Select which business to onboard this vendor under…</option>
                  {businessOptions.map((b) => (
                    <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400">
                  This vendor raised a general signup request without choosing a business — assign one before approving.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">
                {businessLabel(vendor.businessId)}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Facilities</h3>
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {(
                [
                  { key: "enableStoreFront" as const, label: "Store Front" },
                  { key: "enableServiceCenter" as const, label: "Service Center" },
                  { key: "enableWarehouse" as const, label: "Warehouse" },
                ]
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button
                    type="button"
                    disabled={savingFacility === key}
                    onClick={() => toggleFacility(key)}
                    className={`relative w-10 h-5 rounded-full transition disabled:opacity-50 ${
                      facilities[key] ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        facilities[key] ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Contact</h3>
            <div className="rounded-xl border border-gray-200 px-4">
              <div className={rowCls}>
                <span className={labelCls}>Contact Person</span>
                <span className={valueCls}>{vendor.contactPerson || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>Email</span>
                <span className={valueCls}>{vendor.email || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>Phone</span>
                <span className={valueCls}>{vendor.phone || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>Category</span>
                <span className={valueCls}>{vendor.category || "—"}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Compliance</h3>
            <div className="rounded-xl border border-gray-200 px-4">
              <div className={rowCls}>
                <span className={labelCls}>GSTIN</span>
                <span className={`${valueCls} font-mono`}>{vendor.gstNumber || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>PAN</span>
                <span className={`${valueCls} font-mono`}>{vendor.panNumber || "—"}</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Bank Details</h3>
            <div className="rounded-xl border border-gray-200 px-4">
              <div className={rowCls}>
                <span className={labelCls}>Bank</span>
                <span className={valueCls}>{vendor.bankDetails?.bankName || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>Account Number</span>
                <span className={`${valueCls} font-mono`}>{vendor.bankDetails?.accountNumber || "—"}</span>
              </div>
              <div className={rowCls}>
                <span className={labelCls}>IFSC</span>
                <span className={`${valueCls} font-mono`}>{vendor.bankDetails?.ifscCode || "—"}</span>
              </div>
            </div>
          </section>

          {/* Document uploads */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Verification Documents
            </h3>
            <div className="space-y-3">
              <DocumentUploadRow
                label="Bank Passbook / Cancelled Cheque"
                hint="For account number & IFSC confirmation"
                fileUrl={documents.passbookUrl}
              />
              <DocumentUploadRow
                label="GST Certificate"
                hint="Proof of GST registration"
                fileUrl={documents.gstCertificateUrl}
              />
              <DocumentUploadRow
                label="MSME Certificate"
                hint="Udyam/MSME registration certificate"
                fileUrl={documents.compliance?.msme_certificate?.url}
              />
              {extraDocs.map((doc) => (
                <DocumentUploadRow
                  key={doc.key}
                  label={doc.label}
                  hint="Submitted with the application"
                  fileUrl={documents.compliance?.[doc.key]?.url}
                />
              ))}
            </div>
          </section>

          {showRejectBox && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Rejection Reason
              </h3>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this vendor application is being rejected…"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition resize-none"
              />
            </section>
          )}

          {isSuperAdmin && vendor.status === "ACTIVE" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Add Staff (Super Admin)
              </h3>
              <div className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <p className="text-[10px] text-gray-400">
                  Link any existing user to this vendor as staff, by their user ID. The vendor owner can also do this from their own portal.
                </p>
                {staffMessage && (
                  <p className={`text-xs ${staffMessage === "Staff member added." ? "text-emerald-600" : "text-red-600"}`}>
                    {staffMessage}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    placeholder="User ID"
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
                  />
                  <input
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    placeholder="Role (e.g. Warehouse Manager)"
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddStaff}
                  disabled={addingStaff}
                  className="w-full py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {addingStaff ? "Adding…" : "Add Staff Member"}
                </button>
              </div>
            </section>
          )}
        </div>

        {canFinalize && !finalizeResult && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50"
            >
              {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Final Approve &amp; Create Login
            </button>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              The agreement is signed — this creates the vendor&apos;s login and activates their account.
            </p>
          </div>
        )}

        {finalizeResult && (
          <div className="px-6 py-4 border-t border-gray-100 space-y-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Vendor is now ACTIVE. Login: <strong>{finalizeResult.email}</strong>
              {finalizeResult.temporaryPassword && (
                <>
                  <br />
                  Temporary password (shown once — share securely):{" "}
                  <code className="font-mono">{finalizeResult.temporaryPassword}</code>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Close
            </button>
          </div>
        )}

        {canRestartReview && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={handleRestartReview}
              disabled={restarting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition disabled:opacity-50"
            >
              {restarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Restart Review
            </button>
          </div>
        )}

        {canReview && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
            {!showRejectBox ? (
              <button
                onClick={() => setShowRejectBox(true)}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            ) : (
              <button
                onClick={() => handleReview("REJECT")}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirm Reject
              </button>
            )}
            <button
              onClick={() => handleReview("APPROVE")}
              disabled={busy || showRejectBox || (needsBusinessAssignment && !assignBusinessId)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// View-only: documents are only ever uploaded at application/creation time
// (vendor onboarding form or the public vendor-apply signup) — approval is
// a review step, not another chance to attach files, so this no longer
// offers an upload/replace control, only a link to what was already
// submitted (or a plain "Not uploaded" note if a slot is empty).
function DocumentUploadRow({
  label,
  hint,
  fileUrl,
}: {
  label: string;
  hint: string;
  fileUrl?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-gray-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{hint}</p>
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-700 hover:underline"
            >
              View uploaded file
            </a>
          ) : (
            <p className="text-xs text-gray-400 italic">Not uploaded</p>
          )}
        </div>
      </div>
    </div>
  );
}
