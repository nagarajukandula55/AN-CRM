import mongoose from "mongoose";

/**
 * Canonical audit log entry.
 *
 * Historically this schema only had entityType/entityId/action/by/before/
 * after/ip, but the /api/audit/logs POST handler (and now the shared
 * logAction() helper in src/lib/audit/logAction.ts) writes a richer shape —
 * businessId/userId/entity/metadata — which used to be silently stripped by
 * Mongoose since the schema was strict by default. Both the legacy fields
 * and the fields actually used across the app are kept here (entity vs
 * entityType, userId vs by) so nothing written by either call site is lost.
 */
const AuditLogSchema =
  new mongoose.Schema(
    {
      // Multi-tenant scoping — required for almost every write in the app.
      businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
        index: true,
      },

      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        index: true,
      },

      // Actor.
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
      userEmail: String,
      userName: String,
      isSuperAdmin: Boolean,

      // What happened.
      action: {
        type: String,
        index: true,
      },

      // "entity" is the current canonical name; "entityType" is kept for
      // any older reads/writes referencing it. Both are populated together
      // by the shared helper so either naming works going forward.
      entity: {
        type: String,
        index: true,
      },
      entityType: String,

      entityId: mongoose.Schema.Types.Mixed,

      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
      metadata: mongoose.Schema.Types.Mixed,

      by: String, // legacy free-text actor label

      method: String, // HTTP method, when logged from an API route
      path: String, // request path, when logged from an API route
      statusCode: Number,
      // Wall-clock time the wrapped handler took to run, in milliseconds --
      // captured by withAudit() (start-of-handler to response). Absent on
      // call sites that use logAction() directly without going through
      // withAudit(), since those don't have a handler span to measure.
      durationMs: Number,

      ip: String,
      userAgent: String,
    },
    {
      timestamps: true,
      strict: false, // tolerate ad-hoc extra fields from older call sites
    }
  );

AuditLogSchema.index({ businessId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export default
  mongoose.models.AuditLog ||
  mongoose.model(
    "AuditLog",
    AuditLogSchema
  );
