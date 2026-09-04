import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata = {
  title: "Cancellation Policy — AN-CRM",
  description: "AN-CRM subscription fees are non-refundable; how cancellation works.",
};

const MARKDOWN = `
This Policy is part of, and should be read together with, the AN-CRM
Terms of Service. It is drafted with reference to the Consumer Protection
Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.

## 1. Free Trial

Every new account receives a 15-day free trial with full Ultimate-tier
access. No
payment is collected during the trial and no refund question arises for
it — simply do not upgrade to a paid plan if you do not wish to continue,
and access will pause automatically at the end of the trial.

## 2. Subscription Payments Are Non-Refundable

Because AN-CRM is a digital service that is provisioned immediately and
made fully available on payment, **all subscription fees (Yearly or
2-Yearly) are non-refundable once paid, regardless of usage** — this
applies to the full amount, in every case, including if you stop using
the Service before your paid period ends.

## 3. Billing Errors

If you were charged twice for the same billing period, or charged an
amount not matching the plan/period you actually selected, due to a
platform error, contact us and we will correct the charge — this is a
correction of our own mistake, not a discretionary refund, and is the
only circumstance in which money is returned to you, along with any
requirement imposed by the Consumer Protection Act, 2019 or an order of a
competent consumer forum/court that we cannot lawfully waive.

## 4. Upgrades and Downgrades

4.1 **Upgrading** (e.g., Starter → Pro, or Pro → Ultimate) mid-cycle is
charged pro-rata for the remainder of the current billing period; the new
tier's features (including any bundled communication quota) apply
immediately on payment confirmation.

4.2 **Downgrading** takes effect from the start of your next billing
cycle; no refund is issued for the difference in the current, already-
paid cycle.

## 5. Cancellation

5.1 You may cancel auto-renewal at any time from Plan & Billing in your
account. Cancellation stops future billing; it does not refund the
current, already-paid period, and access continues until the current
period's expiry date.

5.2 On expiry without renewal, access is automatically suspended per the
Terms of Service (Section 3.5); your data is retained and can be
restored by renewing.

## 6. Sub-Vendor Addon Charges

Sub-vendor addon charges (paid by a Parent Vendor to add a sub-vendor
under the Ultimate tier) are consumed at the moment the sub-vendor
account is successfully created and are non-refundable thereafter, since
the charge corresponds to a specific, immediately-delivered action.

## 7. Billing Errors — How to Report One

Email **anserviceflow@gmail.com** with your account email, invoice
number, and a description of the discrepancy. We aim to respond within 3
business days.

## 8. Payment Gateway Charges

Where applicable, payment gateway transaction charges (if any, disclosed
separately) are non-refundable, as they are levied by the third-party
payment processor and not retained by us.

*Full source: legal/refund-cancellation-policy.md in the repository.*
`;

export default function RefundPolicyPage() {
  return <LegalDoc title="Cancellation Policy" updatedLabel="Last updated: 4 September 2026" markdown={MARKDOWN} />;
}
