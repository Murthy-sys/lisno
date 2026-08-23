import {
  CONTROL_CHARACTERS,
  INVITABLE_ROLE_CODES,
  USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN,
  USER_INVITATION_EMAIL_MAX,
  USER_INVITATION_MOBILE_MAX,
  USER_INVITATION_NAME_MAX,
  USER_INVITATION_TOKEN_HASH_PATTERN,
  USER_INVITATION_TTL_MS,
  invitationEmailSchema,
  invitationMobileSchema,
  invitationNameSchema,
  normalizeInvitationEmail
} from "../domain/user-invitations.js";
import { model, models, Schema } from "./mongoose.js";

const userInvitationSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: USER_INVITATION_NAME_MAX
    },
    email: { type: String, required: true, maxlength: USER_INVITATION_EMAIL_MAX },
    emailNormalized: {
      type: String,
      required: true,
      maxlength: USER_INVITATION_EMAIL_MAX
    },
    role: {
      type: String,
      enum: INVITABLE_ROLE_CODES,
      required: true,
      immutable: true
    },
    mobile: { type: String, required: true, maxlength: USER_INVITATION_MOBILE_MAX },
    tokenHash: {
      type: String,
      default: null,
      match: USER_INVITATION_TOKEN_HASH_PATTERN,
      select: false
    },
    tokenGeneration: { type: Number, required: true, min: 1 },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "superseded"],
      required: true
    },
    invitedById: { type: String, ref: "User", required: true, immutable: true },
    tokenIssuedById: { type: String, ref: "User", required: true },
    tokenIssuerVersion: { type: Number, required: true, min: 1 },
    acceptedUserId: { type: String, ref: "User", default: null },
    acceptedAt: { type: Date, default: null },
    revokedById: { type: String, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
    supersededByInvitationId: {
      type: String,
      ref: "UserInvitation",
      default: null
    },
    supersededAt: { type: Date, default: null },
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
      match: USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN,
      maxlength: 64
    },
    version: { type: Number, required: true, default: 1, min: 1 }
  },
  { timestamps: true, versionKey: false }
);

userInvitationSchema.pre("validate", function normalizeIdentityFields() {
  const rawName = this.get("name");
  const rawEmail = this.get("email");
  const rawMobile = this.get("mobile");

  const name = invitationNameSchema.safeParse(rawName);
  if (name.success) this.set("name", name.data);
  else this.invalidate("name", "Invitation name is invalid.");

  const email = invitationEmailSchema.safeParse(rawEmail);
  if (email.success) {
    this.set("email", email.data);
    this.set("emailNormalized", normalizeInvitationEmail(email.data));
  } else {
    this.invalidate("email", "Invitation email is invalid.");
  }

  const mobile = invitationMobileSchema.safeParse(rawMobile);
  if (mobile.success) this.set("mobile", mobile.data);
  else this.invalidate("mobile", "Invitation mobile is invalid.");

  for (const [path, rawValue] of [
    ["name", rawName],
    ["email", rawEmail],
    ["mobile", rawMobile]
  ] as const) {
    if (typeof rawValue === "string" && CONTROL_CHARACTERS.test(rawValue)) {
      this.invalidate(path, `Invitation ${path} cannot contain control characters.`);
    }
  }
});

userInvitationSchema.pre("validate", function validateInvitationState() {
  const status = this.get("status");
  const tokenHash = this.get("tokenHash");
  const acceptedUserId = this.get("acceptedUserId");
  const acceptedAt = this.get("acceptedAt");
  const revokedById = this.get("revokedById");
  const revokedAt = this.get("revokedAt");
  const supersededByInvitationId = this.get("supersededByInvitationId");
  const supersededAt = this.get("supersededAt");
  const terminalValues = [
    acceptedUserId,
    acceptedAt,
    revokedById,
    revokedAt,
    supersededByInvitationId,
    supersededAt
  ];

  if (status === "pending") {
    if (
      !isNonEmptyString(tokenHash) ||
      !USER_INVITATION_TOKEN_HASH_PATTERN.test(tokenHash) ||
      terminalValues.some((value) => value !== null)
    ) {
      this.invalidate(
        "status",
        "Pending invitations require a current token hash and no terminal metadata."
      );
    }
  } else if (status === "accepted") {
    if (
      tokenHash !== null ||
      !isNonEmptyString(acceptedUserId) ||
      !isDate(acceptedAt) ||
      [revokedById, revokedAt, supersededByInvitationId, supersededAt].some(
        (value) => value !== null
      )
    ) {
      this.invalidate(
        "status",
        "Accepted invitations require only an accepted User and acceptance time."
      );
    }
  } else if (status === "revoked") {
    if (
      tokenHash !== null ||
      !isNonEmptyString(revokedById) ||
      !isDate(revokedAt) ||
      [acceptedUserId, acceptedAt, supersededByInvitationId, supersededAt].some(
        (value) => value !== null
      )
    ) {
      this.invalidate(
        "status",
        "Revoked invitations require only a revoking actor and revocation time."
      );
    }
  } else if (status === "superseded") {
    if (
      tokenHash !== null ||
      !isNonEmptyString(supersededByInvitationId) ||
      !isDate(supersededAt) ||
      [acceptedUserId, acceptedAt, revokedById, revokedAt].some(
        (value) => value !== null
      )
    ) {
      this.invalidate(
        "status",
        "Superseded invitations require only a successor and superseded time."
      );
    }
  }

  const issuedAt = this.get("issuedAt");
  const expiresAt = this.get("expiresAt");
  if (
    !isDate(issuedAt) ||
    !isDate(expiresAt) ||
    expiresAt.getTime() - issuedAt.getTime() !== USER_INVITATION_TTL_MS
  ) {
    this.invalidate("expiresAt", "Invitation expiry must be exactly 24 hours after issue.");
  }
});

userInvitationSchema.pre("validate", function validateDeliveryState() {
  const deliveryStatus = this.get("deliveryStatus");
  const attemptedAt = this.get("deliveryAttemptedAt");
  const sentAt = this.get("sentAt");
  const failureCode = this.get("deliveryFailureCode");

  if (deliveryStatus === "queued") {
    if (attemptedAt !== null || sentAt !== null || failureCode !== null) {
      this.invalidate("deliveryStatus", "Queued delivery cannot contain telemetry.");
    }
    return;
  }
  if (deliveryStatus === "sent") {
    if (!isDate(attemptedAt) || !isDate(sentAt) || failureCode !== null) {
      this.invalidate(
        "deliveryStatus",
        "Sent delivery requires attempt and sent times without failure code."
      );
    }
    return;
  }
  if (
    deliveryStatus === "failed" &&
    (!isDate(attemptedAt) ||
      sentAt !== null ||
      !isNonEmptyString(failureCode) ||
      !USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN.test(failureCode))
  ) {
    this.invalidate(
      "deliveryStatus",
      "Failed delivery requires an attempt time and bounded failure code without sent time."
    );
  }
});

userInvitationSchema.index(
  { tokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { tokenHash: { $type: "string" } }
  }
);
userInvitationSchema.index({ emailNormalized: 1, status: 1, createdAt: -1, _id: -1 });
userInvitationSchema.index({ status: 1, createdAt: -1, _id: -1 });
userInvitationSchema.index({ status: 1, expiresAt: 1, _id: 1 });
userInvitationSchema.index(
  { acceptedUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { acceptedUserId: { $type: "string" } }
  }
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export const UserInvitationModel =
  models.UserInvitation ?? model("UserInvitation", userInvitationSchema);
