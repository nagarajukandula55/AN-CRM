import { LegalDoc } from "@/components/legal/LegalDoc";

export const metadata = {
  title: "Privacy Policy — AN-CRM",
  description: "How AN-CRM collects, uses, and protects personal data under the DPDP Act, 2023.",
};

const MARKDOWN = `
This Privacy Policy explains how **AN Group (operating the AN-CRM
platform)** ("AN-CRM", "we", "us") collects, uses, discloses, and
protects personal data in connection with the AN-CRM platform, in
accordance with the **Digital Personal Data Protection Act, 2023 ("DPDP
Act")**, the Information Technology Act, 2000 and the Information
Technology (Reasonable Security Practices and Procedures and Sensitive
Personal Data or Information) Rules, 2011 ("SPDI Rules"), to the extent
still applicable.

## 1. Roles: Data Fiduciary and Data Processor

1.1 Where you (a business) use AN-CRM to store and process your own
customers' personal data (names, phone numbers, addresses, purchase
history), **you are the Data Fiduciary** for that data under the DPDP
Act, and **AN-CRM acts as your data processor**, processing it only on
your instructions and for the purpose of providing the Service.

1.2 Where AN-CRM collects data about you and your staff (account holder
details, login credentials, usage data) to operate and bill for the
Service, **AN-CRM is the Data Fiduciary**.

## 2. Personal Data We Collect

- Account & business data: name, email, phone, business name, GSTIN, address, role/designation.
- Customer Data you input: your end-customers' names, phone numbers, addresses, purchase/service history, vehicle/device details, and payment status — processed strictly on your behalf.
- Payment data: subscription payment references are stored (amount, Razorpay payment/order IDs, invoice records); we do not store full card or UPI credentials — these are handled directly by our PCI-DSS compliant payment gateway partner (Razorpay).
- Usage & log data: login timestamps, IP address, device/browser information, audit logs of actions taken in the platform (for security and support purposes).
- Communications quota data: counts of emails/WhatsApp messages sent on your behalf (not the content, beyond what's needed for delivery and support troubleshooting).

## 3. How We Use Personal Data

We use personal data only to: provide and maintain the Service; process
payments and generate invoices; provide customer support; send service
and billing notifications; enforce these Terms/this Policy; comply with
legal obligations (including tax and audit requirements); and, with your
consent, send product updates.

We do **not** sell personal data to third parties.

## 4. Legal Basis and Consent

Where we act as Data Fiduciary (Section 1.2), we process personal data on
the basis of your consent (given at signup) and as necessary to perform
our contract with you (these Terms), and to comply with legal obligations
(e.g., tax records).

## 5. Sharing and Disclosure

We share personal data only with:

- Sub-processors necessary to run the Service: cloud hosting (database/application hosting provider), Razorpay (payments), Resend (transactional email delivery), and a WhatsApp Business API provider (for WhatsApp notifications) — each bound by contract to protect the data and use it only for the purpose we specify.
- Legal/regulatory authorities, where required by law, court order, or to protect our legal rights.
- A successor entity, in the event of a merger, acquisition, or asset sale, subject to this Policy continuing to apply.

We do not permit any vendor/business on the platform to access another
vendor's Customer Data — per-tenant data isolation is enforced at the
application and database level, except for platform administrators
acting for support/legal purposes.

## 6. Data Retention

Personal data is retained for as long as your account is active, and for
the retention period stated in the Terms of Service after termination, or
longer where required by applicable law (e.g., financial records under
the CGST Act 2017 and Income Tax Act 1961).

## 7. Your Rights (as a Data Principal under the DPDP Act, 2023)

Where AN-CRM is the Data Fiduciary for your account data, you have the
right to: access a summary of personal data we hold about you; request
correction or erasure; withdraw consent at any time (which may limit
Service functionality); nominate another individual to exercise your
rights in case of death/incapacity; and grievance redressal (see Section
10). Where AN-CRM is a data processor for your own end-customers' data
(Section 1.1), such requests from your end-customers should be directed
to you as the Data Fiduciary; we will assist you in fulfilling them on
request.

## 8. Data Security

We implement reasonable security practices as contemplated under the IT
Act, 2000 and SPDI Rules, including encrypted transport (HTTPS), password
hashing, role-based access control, per-tenant data isolation,
single-active-session enforcement, and audit logging of sensitive
actions. No system is 100% secure; we will notify affected users and, if
required, the Data Protection Board of India, in the event of a
significant personal data breach as required under the DPDP Act.

## 9. Cross-Border Data Transfer

Data may be hosted on servers located in India or, where our hosting
provider requires, in another jurisdiction. Where data is transferred
outside India, we will do so consistent with the DPDP Act's transfer
provisions and any country-specific restrictions notified by the Central
Government from time to time.

## 10. Grievance Officer Contact

In accordance with the IT Act, 2000 and DPDP Act, 2023, our Grievance
Officer can be contacted at:

**Name:** Raj
**Email:** anserviceflow@gmail.com
**Address:** Visakhapatnam, Andhra Pradesh, India

We will acknowledge grievances within a reasonable time and resolve them
as expeditiously as possible, in line with statutory timelines where
applicable.

## 11. Children's Data

The Service is not directed at individuals under 18. We do not knowingly
collect personal data of children as defined under the DPDP Act without
verifiable parental/guardian consent.

## 12. Changes to This Policy

We may update this Policy from time to time; material changes will be
notified by email or in-app notice.

*Drafted with reference to the Digital Personal Data Protection Act
2023, Information Technology Act 2000, and the SPDI Rules 2011. Full
source: legal/privacy-policy.md in the repository.*
`;

export default function PrivacyPolicyPage() {
  return <LegalDoc title="Privacy Policy" updatedLabel="Last updated: 28 July 2026" markdown={MARKDOWN} />;
}
