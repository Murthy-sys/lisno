import {
  PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN,
  PASSWORD_RESET_TOKEN_HASH_PATTERN,
  PASSWORD_RESET_TTL_MS
} from "../domain/password-resets.js";
import { model, models, Schema } from "./mongoose.js";

const passwordResetRequestSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    userId: { type: String, ref: "User", required: true, immutable: true },
    userVersion: { type: Number, required: true, min: 1, immutable: true },
    sessionVersion: { type: Number, required: true, min: 1, immutable: true },
    tokenHash: {
      type: String,
      default: null,
      match: PASSWORD_RESET_TOKEN_HASH_PATTERN,
      select: false
    },
    tokenGeneration: { type: Number, required: true, min: 1, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    status: {
      type: String,
      enum: ["pending", "superseded", "completed"],
      required: true
    },
    supersededByResetId: {
      type: String,
      ref: "PasswordResetRequest",
      default: null
    },
    supersededAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "failed"],
      required: true
    },
    deliveryAttemptedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    deliveryFailureCode: {
      type: String,
      default: null,
      match: PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN,
      maxlength: 64
    },
    version: { type: Number, required: true, default: 1, min: 1 }
  },
  { timestamps: true, versionKey: false }
);

passwordResetRequestSchema.pre("validate", function validateResetState() {
  const status = this.get("status");
  const tokenHash = this.get("tokenHash");
  const successorId = this.get("supersededByResetId");
  const supersededAt = this.get("supersededAt");
  const completedAt = this.get("completedAt");

  if (status === "pending") {
    if (
      !isNonEmptyString(tokenHash) ||
      !PASSWORD_RESET_TOKEN_HASH_PATTERN.test(tokenHash) ||
      successorId !== null ||
      supersededAt !== null ||
      completedAt !== null
    ) {
      this.invalidate(
        "status",
        "Pending password resets require a current token and no terminal metadata."
      );
    }
  } else if (status === "superseded") {
    if (
      tokenHash !== null ||
      !isNonEmptyString(successorId) ||
      !isDate(supersededAt) ||
      completedAt !== null
    ) {
      this.invalidate(
        "status",
        "Superseded password resets require only a successor and superseded time."
      );
    }
  } else if (
    status === "completed" &&
    (tokenHash !== null ||
      successorId !== null ||
      supersededAt !== null ||
      !isDate(completedAt))
  ) {
    this.invalidate(
      "status",
      "Completed password resets require only a completion time."
    );
  }

  const issuedAt = this.get("issuedAt");
  const expiresAt = this.get("expiresAt");
  if (
    !isDate(issuedAt) ||
    !isDate(expiresAt) ||
    expiresAt.getTime() - issuedAt.getTime() !== PASSWORD_RESET_TTL_MS
  ) {
    this.invalidate(
      "expiresAt",
      "Password reset expiry must be exactly 30 minutes after issue."
    );
  }
});

passwordResetRequestSchema.pre("validate", function validateDeliveryState() {
  const status = this.get("deliveryStatus");
  const attemptedAt = this.get("deliveryAttemptedAt");
  const sentAt = this.get("sentAt");
  const failureCode = this.get("deliveryFailureCode");

  if (status === "queued") {
    if (attemptedAt !== null || sentAt !== null || failureCode !== null) {
      this.invalidate("deliveryStatus", "Queued delivery cannot contain telemetry.");
    }
  } else if (status === "sent") {
    if (!isDate(attemptedAt) || !isDate(sentAt) || failureCode !== null) {
      this.invalidate(
        "deliveryStatus",
        "Sent delivery requires attempt and sent times without a failure code."
      );
    }
  } else if (
    status === "failed" &&
    (!isDate(attemptedAt) ||
      sentAt !== null ||
      !isNonEmptyString(failureCode) ||
      !PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN.test(failureCode))
  ) {
    this.invalidate(
      "deliveryStatus",
      "Failed delivery requires an attempt time and a bounded failure code."
    );
  }
});

passwordResetRequestSchema.index(
  { tokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { tokenHash: { $type: "string" } }
  }
);
passwordResetRequestSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "one_pending_password_reset_per_user"
  }
);
passwordResetRequestSchema.index({ userId: 1, issuedAt: -1, _id: -1 });
passwordResetRequestSchema.index({ status: 1, expiresAt: 1, _id: 1 });

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export const PasswordResetRequestModel =
  models.PasswordResetRequest ??
  model("PasswordResetRequest", passwordResetRequestSchema);
