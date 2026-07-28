import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata = {
  title: "Refund & Cancellation Policy — AN-CRM",
  description: "When a AN-CRM subscription payment is and isn't refundable.",
};

const MARKDOWN = `
This Policy is part of, and should be read together with, the AN-CRM
Terms of Service. It is drafted with reference to the Consumer Protection
Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.

## 1. Free Trial

Every new account on the Basic tier receives a 7-day free trial. No
payment is collected during the trial and no refund question arises for
it — simply do not upgrade to a paid plan if you do not wish to continue,
and access will pause automatically at the end of the trial.

## 2. Subscription Payments Are Generally Non-Refundable

Because AN-CRM is a digital service that is provisioned immediately and
made fully available on payment, and in line with standard SaaS industry
practice, **fees paid for a subscription period (Monthly, Quarterly,
Half-Yearly, or Yearly) are non-refundable once the period has begun**,
except as set out below.

## 3. Exceptions — When a Refund Applies

A refund (in full or pro-rata, at our discretion, to the original payment
method within 7–10 business days of approval) will be made where:

3.1 **Duplicate or erroneous charge** — you were charged twice for the
same billing period, or charged an amount not matching the plan/period
you selected, due to a platform error.

3.2 **Non-delivery of Service** — the Service was not made available to
you at all following a successful payment (e.g., account activation
failed) and we could not remedy this within 5 business days of you
raising it.

3.3 **Extended unplanned downtime** — the Service was unavailable due to
a fault on our side for more than **3 consecutive days in a billing
month**, in which case a pro-rata credit or refund for the affected
period will be issued on request.

3.4 Where required by the Consumer Protection Act, 2019 or an order of a
competent consumer forum/court.

## 4. Upgrades and Downgrades

4.1 **Upgrading** (e.g., Basic → Pro, or Pro → Ultimate) mid-cycle is
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

## 7. How to Request a Refund

Email **anserviceflow@gmail.com** with your account email, invoice
number, and the reason for the request. We aim to respond within 3
business days.

## 8. Payment Gateway Charges

Where applicable, payment gateway transaction charges (if any, disclosed
separately) are non-refundable even where a refund of the underlying
subscription fee is approved, as they are levied by the third-party
payment processor and not retained by us.

*Full source: legal/refund-cancellation-policy.md in the repository.*
`;

export default function RefundPolicyPage() {
  return <LegalDoc title="Refund & Cancellation Policy" updatedLabel="Last updated: 28 July 2026" markdown={MARKDOWN} />;
}
