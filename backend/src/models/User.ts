import { model, models, Schema } from "./mongoose.js";

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["designer", "design_manager", "design_head", "client"],
      required: true
    },
    active: { type: Boolean, required: true, default: true },
    managerId: { type: String, ref: "User", default: null },
    authorizedClientIds: [{ type: String, ref: "User" }],
    avatar: { type: String },
    title: { type: String }
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, active: 1 });
userSchema.index({ managerId: 1, role: 1 });

export const UserModel = models.User ?? model("User", userSchema);
