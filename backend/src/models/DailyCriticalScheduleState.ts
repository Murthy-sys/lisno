import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  firstLocalDate: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/u },
  createdAt: { type: Date, required: true, immutable: true }
}, { versionKey: false });

export const DailyCriticalScheduleStateModel = models.DailyCriticalScheduleState ?? model("DailyCriticalScheduleState", schema);
