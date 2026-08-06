import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Local read-through cache of central-api's role-catalog for one business,
 * per explicit direction: "central-api is the source, local is a synced
 * cache" -- an admin EDITS roles/allowedPages from the Roles & Access
 * panel (which still writes straight to central-api, unchanged), but
 * every actual page-access CHECK reads this local cache instead of making
 * a live central-api call on every single request. Keeps the fast/
 * resilient property every other part of this app already has (a
 * central-api hiccup never breaks a page load) while still making
 * central-api the one place you edit from.
 *
 * Refreshed by refreshRoleCatalogCache() -- called right after any
 * mutation from the Roles & Access panel (so an edit is visible
 * immediately), and lazily on a cache miss / staleness (see
 * lib/access/centralAllowedPages.ts).
 */

export interface IRoleCatalogCache extends Document {
  businessId: mongoose.Types.ObjectId;
  categoryKey: string | null;
  roles: { roleName: string; allowedPages: string[] }[];
  syncedAt: Date;
}

const RoleCatalogCacheSchema = new Schema<IRoleCatalogCache>({
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, unique: true },
  categoryKey: { type: String, default: null },
  roles: [
    {
      roleName: { type: String, required: true },
      allowedPages: { type: [String], default: [] },
      _id: false,
    },
  ],
  syncedAt: { type: Date, required: true },
});

const RoleCatalogCache: Model<IRoleCatalogCache> =
  mongoose.models.RoleCatalogCache || mongoose.model<IRoleCatalogCache>("RoleCatalogCache", RoleCatalogCacheSchema);

export default RoleCatalogCache;
