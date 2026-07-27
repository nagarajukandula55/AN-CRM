import { CourierProvider } from './courierProvider.interface';
import { shiprocketProvider } from './providers/shiprocketProvider';
import { createStubProvider } from './providers/stubProvider';
import { CourierProviderKey, COURIER_PROVIDER_KEYS } from '@/models/Integration';

/** Display metadata for every courier this codebase knows how to plug in.
 * Only SHIPROCKET has a live adapter today — the rest are common Indian
 * courier aggregators/carriers scaffolded as stubs so the business owner
 * can flip them on the moment real credentials are available. */
export const SUPPORTED_COURIERS: { key: CourierProviderKey; label: string }[] = [
  { key: 'SHIPROCKET', label: 'Shiprocket' },
  { key: 'DELHIVERY', label: 'Delhivery' },
  { key: 'BLUEDART', label: 'Bluedart' },
  { key: 'XPRESSBEES', label: 'Xpressbees' },
  { key: 'ECOM_EXPRESS', label: 'Ecom Express' },
];

const registry: Record<string, CourierProvider> = {
  SHIPROCKET: shiprocketProvider,
  DELHIVERY: createStubProvider('DELHIVERY', 'Delhivery'),
  BLUEDART: createStubProvider('BLUEDART', 'Bluedart'),
  XPRESSBEES: createStubProvider('XPRESSBEES', 'Xpressbees'),
  ECOM_EXPRESS: createStubProvider('ECOM_EXPRESS', 'Ecom Express'),
};

export function getCourierProvider(key: string): CourierProvider {
  const provider = registry[key.toUpperCase()];
  if (!provider) {
    throw new Error(`Unknown courier provider: ${key}`);
  }
  return provider;
}

export function listCourierProviders(): CourierProvider[] {
  return COURIER_PROVIDER_KEYS.map((key) => getCourierProvider(key));
}
