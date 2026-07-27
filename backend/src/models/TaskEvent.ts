import { model, models, Schema } from "./mongoose.js";

const taskEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, ref: "Task", required: true, immutable: true },
    actorId: { type: String, ref: "User", required: true, immutable: true },
    type: {
      type: String,
      enum: ["status_changed", "progress_changed", "note_added", "deadline_revised"],
      required: true,
      immutable: true
    },
    occurredAt: { type: Date, required: true, immutable: true },
    from: { type: Schema.Types.Mixed, required: true, immutable: true },
    to: { type: Schema.Types.Mixed, required: true, immutable: true },
    note: { type: String, default: null, immutable: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

taskEventSchema.index({ taskId: 1, occurredAt: 1, _id: 1 });

export const TaskEventModel = models.TaskEvent ?? model("TaskEvent", taskEventSchema);
