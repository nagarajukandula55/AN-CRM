import Notification from "@/models/Notification";
import User from "@/models/User";
import VendorProfile from "@/models/VendorProfile";
import { sendPushToUser, sendPushToUsers } from "@/services/push.service";

/**
 * Server-side helper for other routes/services to raise a persistent,
 * user-facing notification (shows up in /admin/notifications and the
 * sidebar's unread badge) without hand-rolling Notification.create() at
 * every call site. Best-effort: a notification failing to write must never
 * break the actual operation that triggered it.
 *
 * Also fans out to any Expo push tokens registered for this user (mobile
 * apps only get this "live" — the web admin panel already shows it via
 * the in-app Notification row + sidebar unread badge, no push needed).
 * Push is fire-and-forget: it must never delay or fail this call.
 */
export async function notifyUser({
  userId,
  businessId,
  title,
  message,
  type = "info",
  link,
}: {
  userId: string;
  businessId?: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
}) {
  try {
    await Notification.create({ userId, businessId, title, message, type, link });
  } catch (err) {
    console.error("[notification] failed to create notification:", err);
  }
  sendPushToUser(userId, { title, body: message, data: { link } }).catch(() => {});
}

/**
 * Notify the vendor who supplies a product when a customer/retailer
 * places an order for it, so the vendor can process it further (confirm
 * stock, prepare a bulk quote, dispatch, etc.) — mirrors notifyUser's
 * best-effort contract, just resolving VendorProfile -> userId first.
 * Silently no-ops if the vendor has no linked userId (e.g. a
 * super-admin-created product with no vendor account attached yet).
 */
export async function notifyVendor({
  vendorId,
  title,
  message,
  type = "info",
  link,
}: {
  vendorId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
}) {
  try {
    const vendor = await VendorProfile.findById(vendorId).select("userId").lean<any>();
    if (!vendor?.userId) return;
    await notifyUser({ userId: String(vendor.userId), title, message, type, link });
  } catch (err) {
    console.error("[notification] failed to notify vendor:", err);
  }
}

/**
 * Fan-out helper for anything that needs super-admin attention (vendor
 * applications, role/access requests, mobile-app-settings changes, etc.):
 * notifies every SUPER_ADMIN user at once so the person who happens to be
 * online sees and can act on it, instead of one specific admin's queue.
 * `link` should point straight at the page where the action is taken (e.g.
 * the vendor review tab), not just a generic notifications list, so
 * clicking the notification lands the admin exactly where they need to act.
 */
export async function notifySuperAdmins({
  title,
  message,
  type = "info",
  link,
}: {
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
}) {
  try {
    const superAdmins = await User.find({ role: "SUPER_ADMIN" }).select("_id").lean();
    await Promise.all(
      superAdmins.map((u) =>
        Notification.create({ userId: u._id, title, message, type, link })
      )
    );
    sendPushToUsers(
      superAdmins.map((u) => String(u._id)),
      { title, body: message, data: { link } }
    ).catch(() => {});
  } catch (err) {
    console.error("[notification] failed to notify super admins:", err);
  }
}
