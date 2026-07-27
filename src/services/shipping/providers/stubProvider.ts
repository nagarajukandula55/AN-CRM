import { CourierProvider } from '../courierProvider.interface';
import { ProviderNotConfiguredError } from '../types';

/**
 * Placeholder implementation for couriers we don't yet have live API
 * credentials for (Delhivery, Bluedart, Xpressbees, Ecom Express, ...).
 * Every operation throws ProviderNotConfiguredError with a clear message
 * rather than returning a fabricated rate/AWB/tracking status. Once the
 * business owner obtains real credentials, this stub gets replaced by a
 * concrete adapter (see shiprocketProvider.ts for the pattern to follow) —
 * getRates() is the exception: it resolves to an empty array so the
 * best-rate comparison can simply skip an unconfigured provider instead of
 * failing the whole comparison.
 */
export function createStubProvider(key: string, label: string): CourierProvider {
  return {
    key,
    label,
    isConfigured: () => false,
    async getRates() {
      // Silently skip in comparisons — see compareRates.ts.
      return [];
    },
    async createShipment() {
      throw new ProviderNotConfiguredError(label);
    },
    async trackShipment() {
      throw new ProviderNotConfiguredError(label);
    },
    async cancelShipment() {
      throw new ProviderNotConfiguredError(label);
    },
    async requestPickup() {
      throw new ProviderNotConfiguredError(label);
    },
  };
}
