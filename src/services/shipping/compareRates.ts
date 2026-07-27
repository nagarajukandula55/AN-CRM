import { Types } from 'mongoose';
import Integration, { COURIER_PROVIDER_KEYS } from '@/models/Integration';
import { getCourierProvider, SUPPORTED_COURIERS } from './providerRegistry';
import { RateQuoteRequest, RateQuote } from './types';

export interface CompareRatesResult {
  quotes: RateQuote[];
  cheapest: RateQuote | null;
  /** Providers that were skipped because they aren't configured/enabled —
   * surfaced so the UI can be transparent about coverage without treating
   * it as an error. */
  skippedProviders: string[];
}

/**
 * "Best of the best service in affordable rates": calls getRates() across
 * every courier provider the business has enabled (plus Shiprocket, which
 * today is configured globally via env vars rather than per-business), and
 * returns all quotes sorted cheapest-first. A provider that isn't
 * configured (stub, missing credentials, or a genuine lookup failure) is
 * skipped silently — it never fails the whole comparison, and it never
 * fabricates a quote.
 */
export async function compareRates(
  businessId: string | Types.ObjectId,
  request: RateQuoteRequest
): Promise<CompareRatesResult> {
  const activeIntegrations = await Integration.find({
    businessId,
    provider: { $in: COURIER_PROVIDER_KEYS },
    isActive: true,
  })
    .select('provider')
    .lean();

  const businessEnabledKeys = new Set(activeIntegrations.map((i) => i.provider));

  // Shiprocket is currently the only provider wired to a global env-based
  // config (see src/lib/shipping/shiprocket.ts) rather than per-business
  // Integration docs, so it's always attempted — its own isConfigured()
  // check makes it a no-op if the env vars aren't set.
  businessEnabledKeys.add('SHIPROCKET');

  const quotes: RateQuote[] = [];
  const skippedProviders: string[] = [];

  for (const { key } of SUPPORTED_COURIERS) {
    if (!businessEnabledKeys.has(key)) {
      skippedProviders.push(key);
      continue;
    }

    try {
      const provider = getCourierProvider(key);
      const providerQuotes = await provider.getRates(request);
      if (providerQuotes.length === 0) {
        skippedProviders.push(key);
      } else {
        quotes.push(...providerQuotes);
      }
    } catch {
      // A single provider failing (bad credentials, API outage, etc.)
      // should never take down the whole comparison.
      skippedProviders.push(key);
    }
  }

  quotes.sort((a, b) => a.rate - b.rate);

  return {
    quotes,
    cheapest: quotes[0] || null,
    skippedProviders,
  };
}
