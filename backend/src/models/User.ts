import { model, models, Schema } from "./mongoose.js";
import { ROLE_CODES } from "../domain/roles.js";
import { ACCOUNT_KINDS } from "../domain/demo-identities.js";
import { VENDOR_ID_PATTERN } from "../domain/user-invitations.js";

const profilePhotoSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    updatedAt: { type: Date, required: true }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    emailNormalized: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, default: null },
    address: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ROLE_CODES,
      required: true
    },
    vendorId: { type: String, ref: "AiEstimatorKnowledgeVendor", default: null, immutable: true, match: VENDOR_ID_PATTERN },
    active: { type: Boolean, required: true, default: true },
    accountKind: {
      type: String,
      enum: ACCOUNT_KINDS,
      required: true,
      default: "standard"
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    sessionVersion: { type: Number, required: true, default: 1, min: 1 },
    managerId: { type: String, ref: "User", default: null },
    authorizedClientIds: [{ type: String, ref: "User" }],
    avatar: { type: String },
    title: { type: String },
    profilePhoto: { type: profilePhotoSchema, default: undefined },
    profilePhotoRevision: { type: Number, min: 0 }
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ emailNormalized: 1 }, { unique: true });
userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "super_admin" },
    name: "one_super_admin"
  }
);
userSchema.index({ role: 1, active: 1 });
userSchema.index({ vendorId: 1, active: 1 }, { partialFilterExpression: { vendorId: { $type: "string" } } });
userSchema.index({ managerId: 1, role: 1 });

userSchema.pre("validate", function validateVendorMembership() {
  const vendorId = this.get("vendorId");
  if (this.get("role") === "vendor" ? typeof vendorId !== "string" || vendorId.length === 0 : vendorId != null) {
    this.invalidate("vendorId", "Vendor membership is required only for Vendor users.");
  }
});

export const UserModel = models.User ?? model("User", userSchema);
