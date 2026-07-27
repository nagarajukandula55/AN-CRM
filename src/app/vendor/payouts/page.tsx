"use client";

/**
 * Vendor-facing payout settings — lets a vendor submit the bank/KYC
 * details Razorpay Route needs to create their linked account and start
 * receiving automatic transfers when orders including their products are
 * paid for. See core/payouts/razorpayRoute.ts for how this connects to
 * Razorpay, and admin/vendor-settlements/page.tsx for the admin-side
 * ledger of what's actually been paid out.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { validateGSTIN } from "@/lib/validation/gst";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Field, Input, Select } from '@/components/ui/Input'

interface PayoutAccount {
  _id: string;
  status: "NOT_STARTED" | "CREATED" | "ACTIVATED" | "SUSPENDED" | "REJECTED";
  legalBusinessName?: string;
  businessType?: string;
  panNumber?: string;
  gstNumber?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBeneficiaryName?: string;
  contactEmail?: string;
  contactPhone?: string;
  rejectionReason?: string;
}

const STATUS_INFO: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  NOT_STARTED: { label: "Not set up yet", icon: AlertCircle, className: "bg-surface-2 text-ink-2 border-border" },
  CREATED: { label: "Under review by Razorpay", icon: Clock, className: "bg-warning-soft text-warning border-warning/20" },
  ACTIVATED: { label: "Active — ready to receive payouts", icon: CheckCircle2, className: "bg-success-soft text-success border-success/20" },
  SUSPENDED: { label: "Suspended", icon: XCircle, className: "bg-danger-soft text-danger border-danger/20" },
  REJECTED: { label: "Rejected", icon: XCircle, className: "bg-danger-soft text-danger border-danger/20" },
};

export default function VendorPayoutsPage() {
  const { data: accountData, isLoading: loading, mutate: refetchAccount } = useSWR("/api/vendor/payout-account");
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [gstError, setGstError] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalBusinessName: "",
    businessType: "individual",
    panNumber: "",
    gstNumber: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankBeneficiaryName: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    if (accountData?.success && accountData.account) {
      setAccount(accountData.account);
      setForm((f) => ({ ...f, ...accountData.account }));
    }
  }, [accountData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/vendor/payout-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save payout details");
      setAccount(data.account);
      refetchAccount();
      setSuccess("Payout details submitted. Razorpay will review and activate your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading payout settings…" />;

  const statusInfo = STATUS_INFO[account?.status || "NOT_STARTED"];
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-bg py-10 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Payout Settings"
          description="Set up automatic payouts for orders you fulfill — money is transferred directly to your bank account when a customer's payment is captured."
        />

        <div className={`rounded-control border px-4 py-3 flex items-center gap-2 text-sm font-medium ${statusInfo.className}`}>
          <StatusIcon size={16} /> {statusInfo.label}
        </div>

        {account?.status === "REJECTED" && account.rejectionReason && (
          <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {account.rejectionReason}
          </div>
        )}

        {error && (
          <div className="rounded-control border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
        )}
        {success && (
          <div className="rounded-control border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">{success}</div>
        )}

        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Legal Business Name" required>
              <Input required value={form.legalBusinessName} onChange={(e) => setForm((f) => ({ ...f, legalBusinessName: e.target.value }))} />
            </Field>
            <Field label="Business Type">
              <Select value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}>
                {["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "huf", "not_yet_registered"].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="PAN Number">
                <Input value={form.panNumber} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value.toUpperCase() }))} placeholder="AAAAA0000A" />
              </Field>
              <Field label="GST Number" error={gstError}>
                <Input
                  value={form.gstNumber}
                  onChange={(e) => { setForm((f) => ({ ...f, gstNumber: e.target.value.toUpperCase() })); setGstError(""); }}
                  onBlur={() => {
                    if (!form.gstNumber.trim()) { setGstError(""); return; }
                    const result = validateGSTIN(form.gstNumber);
                    setGstError(result.valid ? "" : result.reason || "Invalid GSTIN");
                  }}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Email" required>
                <Input required type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
              </Field>
              <Field label="Contact Phone" required>
                <Input required value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
              </Field>
            </div>
            <div className="pt-2 border-t border-border" />
            <Field label="Bank Beneficiary Name" required>
              <Input required value={form.bankBeneficiaryName} onChange={(e) => setForm((f) => ({ ...f, bankBeneficiaryName: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Account Number" required>
                <Input required value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} />
              </Field>
              <Field label="IFSC Code" required>
                <Input required value={form.bankIfsc} onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value.toUpperCase() }))} placeholder="HDFC0001234" />
              </Field>
            </div>

            <Button type="submit" disabled={saving} loading={saving} className="w-full">
              {saving ? "Submitting…" : account ? "Update Payout Details" : "Set Up Payouts"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
