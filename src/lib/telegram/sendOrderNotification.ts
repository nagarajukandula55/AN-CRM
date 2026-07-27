export async function sendOrderNotification(order: any) {
  try {
    // Prefer the per-business Telegram config set via
    // /admin/integrations (backed by the Integration model, provider
    // 'TELEGRAM') so each business's orders notify their own bot/chat —
    // falls back to the global TELEGRAM_BOT_TOKEN/TELEGRAM_GROUP_ID env
    // vars for businesses that haven't configured one yet.
    let token = process.env.TELEGRAM_BOT_TOKEN;
    let chatIds: string[] = process.env.TELEGRAM_GROUP_ID
      ? [process.env.TELEGRAM_GROUP_ID]
      : [];

    const businessId = order?.businessId?.toString?.() || order?.businessId;
    if (businessId) {
      try {
        const { connectDB } = await import("@/lib/mongodb");
        const { default: Integration } = await import("@/models/Integration");
        await connectDB();
        const integration = await Integration.findOne({
          businessId,
          provider: "TELEGRAM",
          isActive: true,
        }).lean();
        const cfg = integration?.config as
          | { botToken?: string; chatIds?: string[] }
          | undefined;
        if (cfg?.botToken && cfg?.chatIds?.length) {
          token = cfg.botToken;
          chatIds = cfg.chatIds;
        }
      } catch (lookupErr) {
        console.error(
          "Telegram per-business config lookup failed, falling back to env vars:",
          lookupErr
        );
      }
    }

    if (!token || chatIds.length === 0) {
      console.log("Telegram config missing");
      return;
    }

    // =========================
    // ITEMS FORMAT
    // =========================
    const itemsText =
      order.items?.length
        ? order.items
            .map(
              (item: any, i: number) =>
                `${i + 1}. ${item.name} x ${item.qty} (₹${item.price})`
            )
            .join("\n")
        : "No items";

    // =========================
    // ADDRESS FORMAT
    // =========================
    const address = order.address
      ? `
🏠 Address:
${order.address.addressLine1 || ""}
${order.address.city || ""}, ${order.address.state || ""}
Pincode: ${order.address.pincode || ""}
`
      : "";

    // =========================
    // SHIPPING INFO
    // =========================
    const shipping = order.shipping
      ? `
🚚 Shipping:
Courier: ${order.shipping.courierPartner || "-"}
AWB: ${order.shipping.awbNumber || "-"}
Status: ${order.shipping.trackingStatus || "PENDING"}
Weight: ${order.shipping.packageWeight || "-"} kg
`
      : "";

    // =========================
    // FINAL MESSAGE
    // =========================
    const message = `
<b>🛒 NEW ORDER RECEIVED</b>

<b>Order ID:</b> ${order.orderId}
<b>Status:</b> ${order.status}

<b>👤 Customer</b>
Name: ${order.address?.name || "-"}
Phone: ${order.address?.phone || "-"}

💰 Amount: ₹${order.amount}

<b>🛍 Items</b>
${itemsText}

${address}

${shipping}

⚠️ <b>Action Required:</b>
- Verify payment
- Start packing
- Prepare shipment
`;

    // =========================
    // SEND TO TELEGRAM
    // =========================
    await Promise.allSettled(
      chatIds.map((chatId) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
          }),
        })
      )
    );
  } catch (err) {
    console.error("Telegram notification failed", err);
  }
}
