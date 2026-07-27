export const metadata = {
  title: "Privacy Policy — AN Group",
  description: "How AN Group collects, uses, and protects your data across the web platform and mobile apps.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: {new Date().toISOString().slice(0, 10)}</p>

      <Section title="1. Who we are">
        <p>
          AN Group ("we", "us") operates the AN Group web platform (angroup.in) and its companion
          Android and iOS mobile apps. This policy explains what information we collect, why, and how
          you can control it.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>Account details you provide: name, email, phone number, password (stored hashed, never in plain text).</li>
          <li>Business/vendor onboarding details: company name, GST/PAN/business registration documents, bank details, addresses — only when you submit them through a registration or vendor-application form.</li>
          <li>Order and transaction data: items purchased, delivery address, payment status (payment card/UPI details are handled directly by our payment processor, Razorpay — we never store your card number).</li>
          <li>Usage data: pages/screens visited, actions taken in the app, device type, and app version, used to diagnose issues and improve the product.</li>
        </ul>
      </Section>

      <Section title="3. How we use your information">
        <ul className="list-disc pl-5 space-y-1">
          <li>To create and manage your account and process orders.</li>
          <li>To verify vendor applications and business onboarding.</li>
          <li>To send transactional emails/notifications (order updates, OTPs, password resets) via our email provider (Resend) and, where enabled, push notifications.</li>
          <li>To improve the platform and respond to support requests.</li>
        </ul>
      </Section>

      <Section title="4. Sharing">
        <p>
          We do not sell your personal data. We share data only with service providers necessary to
          operate the platform — payment processing (Razorpay), email delivery (Resend), shipping
          partners you choose at checkout, and cloud hosting/database infrastructure — each bound to
          use your data only to provide that service.
        </p>
      </Section>

      <Section title="5. Your choices">
        <ul className="list-disc pl-5 space-y-1">
          <li>You can review and update your profile details at any time from your account.</li>
          <li>You can request deletion of your account and associated personal data by contacting us (see below); some records (e.g. invoices) may be retained where required by law.</li>
          <li>Push notifications can be disabled from your device's system settings at any time.</li>
        </ul>
      </Section>

      <Section title="6. Data retention & security">
        <p>
          We retain personal data only as long as needed for the purposes above or as required by
          applicable law (e.g. tax/invoicing records). Data is stored on access-controlled
          infrastructure and passwords are hashed, never stored in plain text.
        </p>
      </Section>

      <Section title="7. Children">
        <p>This platform is intended for business and retail use by adults and is not directed at children under 18.</p>
      </Section>

      <Section title="8. Changes to this policy">
        <p>We may update this policy as the product evolves. Material changes will be reflected by updating the "Last updated" date above.</p>
      </Section>

      <Section title="9. Contact">
        <p>
          For any privacy questions or data requests, contact us at{" "}
          <a href="mailto:support@angroup.in" className="text-blue-600 underline">support@angroup.in</a>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}
