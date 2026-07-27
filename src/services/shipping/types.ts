/**
 * Shared types for the courier-provider abstraction. These are deliberately
 * modeled after what the existing Shiprocket integration already does
 * (src/lib/shipping/*.ts) rather than an idealized API — Shiprocket is the
 * first concrete implementation of CourierProvider, not a special case.
 */

export interface ShippingAddress {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface PackageDimensions {
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface RateQuoteRequest {
  pickupPincode: string;
  deliveryPincode: string;
  weight: number;
  cod?: boolean;
}

export interface RateQuote {
  /** Which provider this quote came from, e.g. "SHIPROCKET". */
  provider: string;
  /** Provider-specific courier identifier (e.g. Shiprocket's courier_company_id). */
  courierId: string;
  courierName: string;
  rate: number;
  etaDays?: number | null;
  /** Raw provider payload, kept around for anything the UI wants to show
   * that isn't normalized here. */
  raw?: unknown;
}

export interface ShipmentOrderItem {
  name: string;
  sku: string;
  units: number;
  sellingPrice: number;
  discount?: number;
  tax?: number;
}

export interface CreateShipmentRequest {
  orderId: string;
  courierId: string;
  billingAddress: ShippingAddress;
  items: ShipmentOrderItem[];
  subTotal: number;
  paymentMethod: 'Prepaid' | 'COD';
  dimensions: PackageDimensions;
}

export interface CreateShipmentResult {
  success: true;
  provider: string;
  shipmentId: string;
  awb: string;
  labelUrl?: string;
}

export interface TrackingResult {
  provider: string;
  awb: string;
  status: string;
  raw?: unknown;
}

export interface PickupResult {
  provider: string;
  pickupStatus: string;
  pickupToken?: string | null;
  raw?: unknown;
}

/** Thrown by stub/unconfigured providers so callers can distinguish "not
 * set up yet" from a genuine API failure — never fabricate a response here. */
export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: string) {
    super(
      `${provider} is not yet configured — add API credentials in Settings > Logistics.`
    );
    this.name = 'ProviderNotConfiguredError';
  }
}
