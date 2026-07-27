import Order from "@/models/Order";
import { shiprocketRequest } from "./shiprocket";

export async function createShiprocketShipment(
  orderId: string,
  courierId: string
) {
  const order: any = await Order.findOne({
  orderId,
}).lean();

  if (!order) {
    throw new Error("Order not found");
  }

  console.log("================================");
  console.log("SHIPROCKET ORDER:", orderId);
  console.log("================================");

  const orderItemsRaw =
  Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.cart)
    ? order.cart
    : [];

const orderItems = orderItemsRaw
  .filter(Boolean)
  .map((item: any) => ({
    name: item.name || "Product",
    sku: item.snapshot?.sku || item.sku || item.productKey || "SKU",
    units: Number(item.qty || 1),
    selling_price: Number(item.price || 0),
    discount: 0,
    tax: Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0),
  }));

  if (!orderItems.length) {
    console.log(
      "FULL ORDER:",
      JSON.stringify(order, null, 2)
    );

    throw new Error(
      "No order items found"
    );
  }

  /* ============================
     VALIDATIONS
  ============================ */

  if (!order.address?.name) {
    throw new Error(
      "Customer name missing"
    );
  }

  if (!order.address?.phone) {
    throw new Error(
      "Customer phone missing"
    );
  }

  if (!order.address?.address) {
    throw new Error(
      "Customer address missing"
    );
  }

  if (!order.address?.city) {
    throw new Error(
      "Customer city missing"
    );
  }

  if (!order.address?.state) {
    throw new Error(
      "Customer state missing"
    );
  }

  if (!order.address?.pincode) {
    throw new Error(
      "Customer pincode missing"
    );
  }

  const payload = {
    order_id: order.orderId,

    order_date: new Date()
      .toISOString()
      .split("T")[0],

    pickup_location: "Home-1",

    billing_customer_name:
      order.address?.name,

    billing_last_name: "",

    billing_address:
      order.address?.address,

    billing_city:
      order.address?.city,

    billing_pincode:
      String(
        order.address?.pincode
      ),

    billing_state:
      order.address?.state,

    billing_country: "India",

    billing_email:
      order.address?.email ||
      "support@angroup.in",

    billing_phone: String(
      order.address?.phone
    ),

    shipping_is_billing: true,

    order_items: orderItems.map(
      (item: any) => ({
        name:
          item.name ||
          "Product",

        sku:
          item?.snapshot?.sku ||
          item?.sku ||
          item?.productKey ||
          `SKU-${Date.now()}`,

        units: Number(
          item.qty || 1
        ),

        selling_price: Number(
          item.price ||
            item.sellingPrice ||
            0
        ),

        discount: Number(
          item.discount || 0
        ),

        tax: Number(
          item.gstAmount || 0
        ),
      })
    ),

    payment_method:
      order.payment?.status ===
      "SUCCESS"
        ? "Prepaid"
        : "COD",

    sub_total:
      Number(order.amount) || 0,

    length:
      Number(
        order.shipping
          ?.dimensions?.length
      ) || 10,

    breadth:
      Number(
        order.shipping
          ?.dimensions?.breadth
      ) || 10,

    height:
      Number(
        order.shipping
          ?.dimensions?.height
      ) || 10,

    weight:
      Number(
        order.shipping
          ?.packageWeight
      ) || 0.5,
  };

  console.log(
    "SHIPROCKET PAYLOAD:"
  );

  console.log(
    JSON.stringify(
      payload,
      null,
      2
    )
  );

  /* ============================
     CREATE SHIPMENT
  ============================ */

  const createOrder =
    await shiprocketRequest(
      "/orders/create/adhoc",
      {
        method: "POST",
        body: JSON.stringify(
          payload
        ),
      }
    );

  console.log(
    "SHIPROCKET CREATE ORDER RESPONSE:"
  );

  console.log(
    JSON.stringify(
      createOrder,
      null,
      2
    )
  );

  const shipmentId =
    createOrder?.shipment_id ||
    createOrder?.shipmentId ||
    createOrder?.shipment_details
      ?.shipment_id ||
    createOrder?.data
      ?.shipment_id;

  if (!shipmentId) {
    throw new Error(
      JSON.stringify(
        createOrder
      )
    );
  }

  /* ============================
     ASSIGN AWB
  ============================ */

  const awbResponse =
    await shiprocketRequest(
      "/courier/assign/awb",
      {
        method: "POST",
        body: JSON.stringify({
          shipment_id:
            shipmentId,

          courier_id:
            Number(
              courierId
            ),
        }),
      }
    );

  console.log(
    "AWB RESPONSE:"
  );

  console.log(
    JSON.stringify(
      awbResponse,
      null,
      2
    )
  );

  const awb =
    awbResponse?.response
      ?.data?.awb_code ||
    awbResponse?.awb_code ||
    awbResponse?.data
      ?.awb_code;

  if (!awb) {
    throw new Error(
      JSON.stringify(
        awbResponse
      )
    );
  }

  /* ============================
     LABEL
  ============================ */

  const labelResponse =
    await shiprocketRequest(
      "/courier/generate/label",
      {
        method: "POST",
        body: JSON.stringify({
          shipment_id: [
            shipmentId,
          ],
        }),
      }
    );

  console.log(
    "LABEL RESPONSE:"
  );

  console.log(
    JSON.stringify(
      labelResponse,
      null,
      2
    )
  );

  return {
    success: true,

    shipmentId,

    awb,

    labelUrl:
      labelResponse
        ?.label_url ||
      labelResponse?.data
        ?.label_url ||
      "",
  };
}
