import { model, models, Schema } from "./mongoose.js";
import { ROLE_CODES } from "../domain/roles.js";
import { ACCOUNT_KINDS } from "../domain/demo-identities.js";

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
    active: { type: Boolean, required: true, default: true },
    accountKind: {
      type: String,
      enum: ACCOUNT_KINDS,
      required: true,
      default: "standard"
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    managerId: { type: String, ref: "User", default: null },
    authorizedClientIds: [{ type: String, ref: "User" }],
    avatar: { type: String },
    title: { type: String }
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ emailNormalized: 1 }, { unique: true });
userSchema.index({ role: 1, active: 1 });
userSchema.index({ managerId: 1, role: 1 });

export const UserModel = models.User ?? model("User", userSchema);
