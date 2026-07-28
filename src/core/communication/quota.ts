/**
 * Quota check-and-increment for platform-sent email/WhatsApp -- see
 * models/CommunicationQuota.ts's top comment for the full rationale.
 *
 * NOT YET wired into every actual send call site (services/email/
 * resend.service.ts, any WhatsApp sender) -- that's real, mechanical
 * follow-up work touching each send path individually. This is the
 * reusable gate those call sites should each add:
 *
 *   const allowed = await checkAndIncrementQuota(businessId, "email");
 *   if (!allowed) { // quota exhausted or channel not enabled -- skip/queue/alert }
 */
import CommunicationQuota from "@/models/CommunicationQuota";

function isNewPeriod(periodStart: Date): boolean {
  const now = new Date();
  return now.getFullYear() !== periodStart.getFullYear() || now.getMonth() !== periodStart.getMonth();
}

export async function checkAndIncrementQuota(
  businessId: string,
  channel: "email" | "whatsapp"
): Promise<boolean> {
  const quota = await CommunicationQuota.findOne({ businessId });
  if (!quota) return false; // no quota row = not opted in yet

  if (isNewPeriod(quota.periodStart)) {
    quota.periodStart = new Date();
    quota.emailUsed = 0;
    quota.whatsappUsed = 0;
  }

  if (channel === "email") {
    if (!quota.emailEnabled || quota.emailUsed >= quota.emailQuota) {
      await quota.save();
      return false;
    }
    quota.emailUsed += 1;
  } else {
    if (!quota.whatsappEnabled || quota.whatsappUsed >= quota.whatsappQuota) {
      await quota.save();
      return false;
    }
    quota.whatsappUsed += 1;
  }

  await quota.save();
  return true;
}
