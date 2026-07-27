import { CourierProvider } from '../courierProvider.interface';
import {
  RateQuoteRequest,
  RateQuote,
  CreateShipmentRequest,
  CreateShipmentResult,
  TrackingResult,
  PickupResult,
} from '../types';
import { getShiprocketToken, shiprocketRequest } from '@/lib/shipping/shiprocket';

/**
 * Thin adapter over the existing, already-working Shiprocket integration
 * (src/lib/shipping/*.ts). It does not duplicate auth/request logic — it
 * reuses getShiprocketToken/shiprocketRequest so the live Shiprocket flow
 * keeps working exactly as before; this class only normalizes the
 * request/response shapes to the shared CourierProvider contract.
 */
class ShiprocketProvider implements CourierProvider {
  readonly key = 'SHIPROCKET';
  readonly label = 'Shiprocket';

  isConfigured(): boolean {
    return !!(
      process.env.SHIPROCKET_BASE_URL &&
      process.env.SHIPROCKET_EMAIL &&
      process.env.SHIPROCKET_PASSWORD
    );
  }

  async getRates(request: RateQuoteRequest): Promise<RateQuote[]> {
    if (!this.isConfigured()) return [];

    const token = await getShiprocketToken();

    const url =
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${request.pickupPincode}` +
      `&delivery_postcode=${request.deliveryPincode}` +
      `&cod=${request.cod ? 1 : 0}` +
      `&weight=${request.weight}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.message || 'Shiprocket rate lookup failed');
    }

    const availableCouriers = result?.data?.available_courier_companies || [];

    return availableCouriers.map((c: any): RateQuote => ({
      provider: this.key,
      courierId: String(c.courier_company_id),
      courierName: c.courier_name,
      rate: Number(c.freight_charge) || 0,
      etaDays: c.estimated_delivery_days ?? null,
      raw: c,
    }));
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult> {
    const payload = {
      order_id: request.orderId,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: 'Home-1',
      billing_customer_name: request.billingAddress.name,
      billing_last_name: '',
      billing_address: request.billingAddress.address,
      billing_city: request.billingAddress.city,
      billing_pincode: String(request.billingAddress.pincode),
      billing_state: request.billingAddress.state,
      billing_country: request.billingAddress.country || 'India',
      billing_email: request.billingAddress.email || 'support@angroup.in',
      billing_phone: String(request.billingAddress.phone),
      shipping_is_billing: true,
      order_items: request.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.sellingPrice,
        discount: item.discount || 0,
        tax: item.tax || 0,
      })),
      payment_method: request.paymentMethod,
      sub_total: request.subTotal,
      length: request.dimensions.length,
      breadth: request.dimensions.breadth,
      height: request.dimensions.height,
      weight: request.dimensions.weight,
    };

    const createOrder = await shiprocketRequest('/orders/create/adhoc', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const shipmentId =
      createOrder?.shipment_id ||
      createOrder?.shipmentId ||
      createOrder?.shipment_details?.shipment_id ||
      createOrder?.data?.shipment_id;

    if (!shipmentId) {
      throw new Error(JSON.stringify(createOrder));
    }

    const awbResponse = await shiprocketRequest('/courier/assign/awb', {
      method: 'POST',
      body: JSON.stringify({
        shipment_id: shipmentId,
        courier_id: Number(request.courierId),
      }),
    });

    const awb =
      awbResponse?.response?.data?.awb_code ||
      awbResponse?.awb_code ||
      awbResponse?.data?.awb_code;

    if (!awb) {
      throw new Error(JSON.stringify(awbResponse));
    }

    const labelResponse = await shiprocketRequest('/courier/generate/label', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    });

    return {
      success: true,
      provider: this.key,
      shipmentId: String(shipmentId),
      awb: String(awb),
      labelUrl: labelResponse?.label_url || labelResponse?.data?.label_url || '',
    };
  }

  async trackShipment(awbNumber: string): Promise<TrackingResult> {
    const response = await shiprocketRequest(`/courier/track/awb/${awbNumber}`);
    const trackingData = response?.tracking_data;
    const status =
      trackingData?.shipment_status || trackingData?.current_status || 'UNKNOWN';

    return {
      provider: this.key,
      awb: awbNumber,
      status,
      raw: response,
    };
  }

  async cancelShipment(shipmentId: string): Promise<{ success: boolean; message?: string }> {
    const response = await shiprocketRequest('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [Number(shipmentId)] }),
    });

    return {
      success: !!(response?.message || response?.status_code === 200),
      message: response?.message,
    };
  }

  async requestPickup(shipmentId: string): Promise<PickupResult> {
    const response = await shiprocketRequest('/courier/generate/pickup', {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [shipmentId] }),
    });

    if (!response?.pickup_status) {
      throw new Error('Pickup request failed');
    }

    return {
      provider: this.key,
      pickupStatus: response.pickup_status,
      pickupToken: response.pickup_token || null,
      raw: response,
    };
  }
}

export const shiprocketProvider = new ShiprocketProvider();
