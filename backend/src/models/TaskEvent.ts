import { model, models, Schema } from "mongoose";

const taskEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, ref: "Task", required: true },
    actorId: { type: String, ref: "User", required: true },
    type: {
      type: String,
      enum: ["status_changed", "progress_changed", "note_added", "deadline_revised"],
      required: true
    },
    occurredAt: { type: Date, required: true },
    from: { type: Schema.Types.Mixed, required: true },
    to: { type: Schema.Types.Mixed, required: true },
    note: { type: String, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

taskEventSchema.index({ taskId: 1, occurredAt: 1, _id: 1 });

export const TaskEventModel = models.TaskEvent ?? model("TaskEvent", taskEventSchema);
