import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { ExecutionChangeEventModel } from "../models/ExecutionChangeEvent.js";

export interface ExecutionChange {
  projectId: string;
  vendorId?: string | null;
  assignmentId?: string | null;
  version: number;
  kind: string;
  occurredAt: Date;
}
/** Consumers observe only committed records. No external I/O inside this transaction. */
export async function appendExecutionChange(event: ExecutionChange, session: ClientSession): Promise<void> {
  await ExecutionChangeEventModel.create([{ _id: `execution-change-${randomUUID()}`, ...event }], { session });
}
