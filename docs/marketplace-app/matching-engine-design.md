# Matching Engine — Hybrid Design

## Flow
1. Customer creates a booking request (extends today's `CrmCall` creation
   flow: category/service, address, requested time window).
2. **Auto-suggest**: matching engine ranks candidate providers by:
   - Category/service match (provider's declared `ServiceCategory`
     offerings, from `VendorProfile`)
   - Proximity (provider's service area / last-known location vs.
     customer's address — needs a geo field added to `VendorProfile`/
     `VendorStaffSlot`, not present today, see Open Gaps below)
   - Availability (provider marked online/available for the requested
     window — needs verification of whether `VendorStaffSlot` is a real
     calendar or just a staff roster; treat as an open gap until confirmed)
   - Rating (once the ratings model exists — see Open Gaps)
3. **Human confirm**: ranked shortlist surfaces to a CCO (Ops mode) to
   confirm/override, OR directly to the top-ranked provider to accept/
   decline (configurable per category/region via `featureFlags` on
   `Region` — e.g. `autoDispatchToProvider: true` skips the CCO step for
   high-trust categories once proven out).
4. On accept, a `CrmJobSheet` is created/assigned exactly as today's
   `assign-engineer` flow does — the matching engine's job ends at handing
   off an accepted provider, the existing job lifecycle takes over
   unchanged.

## Why hybrid over full-auto (Urban Company's model)
Urban Company's real matching is closer to fully automatic + slot-based.
This plan deliberately keeps a human-confirm step as a QC safety net during
the pilot (per your explicit direction) — the `autoDispatchToProvider` flag
above is the designed escape hatch to move toward full-auto per
category/region later without a redesign, once trust is established.

## Scale sizing (from the earlier scale-band estimate)
At pilot/medium scale (200-3,000 providers, 3-8 cities), a per-city
candidate pool is small enough that a straightforward MongoDB geo query
(`$geoNear` + category filter + availability filter) is sufficient — no
dedicated search/ranking service needed until deep into the "large" band
(thousands of providers per single city).

## Open gaps to close before this is buildable (unverified against code yet)
1. **Provider geo/location** — confirm whether `VendorProfile`/
   `VendorStaffSlot` has any location field today; if not, add a
   service-area (city/pincode list) as the pilot-scale proxy for full
   lat/lng tracking (simpler, sufficient at pilot scale, upgradable later).
2. **Availability calendar** — read `VendorStaffSlot`'s actual schema/usage
   to confirm it's a real per-slot calendar vs. a static staff roster; the
   matching engine's "available for requested window" check depends on
   which it actually is.
3. **Ratings & reviews** — no model exists yet; new `JobRating` tied to a
   closed `CrmJobSheet`, feeds the ranking score once enough data exists
   (cold-start: rank without rating weight until a provider has N
   completed jobs).
4. **Assignment route reality check** — read
   `src/app/api/crm/jobsheets/[id]/assign-engineer/route.ts` to confirm
   today's assignment logic (manual CCO pick vs. any existing ranking) so
   the matching engine augments it rather than duplicating/conflicting.

These four are flagged as the concrete next research task before writing
the matching engine's actual API route — not guessed at further here.
