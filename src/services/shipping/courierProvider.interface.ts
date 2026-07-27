import {
  RateQuoteRequest,
  RateQuote,
  CreateShipmentRequest,
  CreateShipmentResult,
  TrackingResult,
  PickupResult,
} from './types';

/**
 * Contract every courier integration must implement. Extracted from the
 * operations the existing Shiprocket integration already performs
 * (src/lib/shipping/*.ts): serviceability/rate lookup, shipment + AWB + label
 * creation, pickup requests, and tracking sync. Shiprocket becomes the first
 * concrete implementation of this interface rather than a one-off.
 */
export interface CourierProvider {
  /** Stable key, e.g. "SHIPROCKET", "DELHIVERY". */
  readonly key: string;
  /** Human-readable display name for admin UI. */
  readonly label: string;

  /** Whether this provider currently has usable credentials configured. */
  isConfigured(): Promise<boolean> | boolean;

  getRates(request: RateQuoteRequest): Promise<RateQuote[]>;

  createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>;

  trackShipment(awbNumber: string): Promise<TrackingResult>;

  cancelShipment(shipmentId: string): Promise<{ success: boolean; message?: string }>;

  requestPickup(shipmentId: string): Promise<PickupResult>;
}
