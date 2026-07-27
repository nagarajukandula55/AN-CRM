import Customer from "@/models/Customer";

/**
 * Shared "someone's contact details just got captured somewhere" hook.
 * Every place in the app that collects a name/phone/email from a real
 * person (a CRM lead, a newsletter signup, an appointment request, etc.)
 * should call this so Admin > Customer Data ends up as one real directory
 * instead of that information being trapped inside whichever module
 * collected it. Upserts by (businessId, email) or (businessId, phone) --
 * whichever is available -- so the same person submitting a newsletter
 * signup and later a CRM lead becomes one Customer record with a note of
 * where the info came from, not two disconnected rows.
 *
 * Best-effort: a capture failing here must never break the caller's
 * actual operation (the lead/appointment/etc. itself still gets created
 * either way), same convention as notification.service.ts.
 */
export async function captureCustomer({
  businessId,
  name,
  phone,
  email,
  address,
  city,
  state,
  pincode,
  sourceModule,
  sourceLabel,
  vendorId,
}: {
  businessId?: string | null;
  // Optional -- e.g. a newsletter signup only ever has an email, no name.
  // Falls back to the email/phone itself so the record is still creatable.
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  sourceModule: string;
  sourceLabel?: string;
  vendorId?: string | null;
}) {
  try {
    if (!phone?.trim() && !email?.trim()) {
      // Not enough to identify/dedupe a real person -- skip rather than
      // create an unfindable, unmergeable record.
      return;
    }

    const matchQuery: Record<string, unknown> = { businessId: businessId || null };
    if (email?.trim()) matchQuery.email = email.trim().toLowerCase();
    else matchQuery.phone = phone!.trim();

    const resolvedName = name?.trim() || email?.trim() || phone!.trim();

    await Customer.findOneAndUpdate(
      matchQuery,
      {
        $set: {
          name: resolvedName,
          ...(phone?.trim() ? { phone: phone.trim() } : {}),
          ...(email?.trim() ? { email: email.trim().toLowerCase() } : {}),
          ...(address?.trim() ? { address: address.trim() } : {}),
          ...(city?.trim() ? { city: city.trim() } : {}),
          ...(state?.trim() ? { state: state.trim() } : {}),
          ...(pincode?.trim() ? { pincode: pincode.trim() } : {}),
          sourceModule,
          source: sourceLabel || sourceModule,
          vendorId: vendorId || null,
        },
        $setOnInsert: { isActive: true },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("[customer-capture] failed to upsert customer record:", err);
  }
}
