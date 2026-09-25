import { model, models, Schema } from "./mongoose.js";
import { ROLE_CODES } from "../domain/roles.js";

const person = new Schema({ id: { type: String, required: true }, name: { type: String, required: true }, role: { type: String, enum: ROLE_CODES, required: true } }, { _id: false });
const exclusion = new Schema({
  _id: { type: String, required: true },
  projectId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  person: { type: person, required: true },
  active: { type: Boolean, required: true },
  version: { type: Number, required: true, min: 1 },
  history: { type: [new Schema({ active: { type: Boolean, required: true }, version: { type: Number, required: true, min: 1 }, actor: { type: person, required: true }, reason: { type: String, required: true, maxlength: 1000 }, occurredAt: { type: String, required: true } }, { _id: false })], required: true }
}, { versionKey: false });
exclusion.index({ projectId: 1, userId: 1 }, { unique: true });

const actionType = new Schema({
  _id: { type: String, required: true, immutable: true },
  name: { type: String, required: true, maxlength: 60, immutable: true },
  normalizedName: { type: String, required: true, immutable: true },
  priority: { type: String, enum: ["important"], required: true, immutable: true },
  builtIn: { type: Boolean, validate: (value: boolean) => value === false, required: true, immutable: true },
  createdBy: { type: String, required: true, immutable: true },
  createdAt: { type: String, required: true, immutable: true }
}, { versionKey: false });
actionType.index({ normalizedName: 1 }, { unique: true });

export const ProjectChatExclusionModel = models.ProjectChatExclusion ?? model("ProjectChatExclusion", exclusion);
export const ProjectChatActionTypeModel = models.ProjectChatActionType ?? model("ProjectChatActionType", actionType);
