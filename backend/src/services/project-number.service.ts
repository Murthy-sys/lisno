import type { ClientSession, PipelineStage } from "mongoose";
import { formatProjectNumber, parseProjectNumber, projectNumberStateConflict } from "../domain/project-number.js";
import { ApiError } from "../middleware/errors.js";
import { LeadModel } from "../models/Lead.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { PROJECT_NUMBER_SEQUENCE_ID, ProjectNumberSequenceModel } from "../models/ProjectNumberSequence.js";
import type { AuditService } from "./audit.service.js";

export class ProjectNumberInitializationConflict extends Error {}

function numberStatePipeline(field: string): PipelineStage[] {
  return [
    { $project: { _id: 0, value: { $cond: [{ $eq: [{ $type: field }, "string"] }, field, ""] } } },
    { $set: { suffix: { $convert: { input: { $substrCP: ["$value", 5, 32] }, to: "long", onError: 0, onNull: 0 } } } },
    { $set: { expected: { $concat: ["Lisno", { $cond: [
      { $lt: ["$suffix", 1_000_000] },
      { $substrCP: [{ $concat: ["000000", { $toString: "$suffix" }] }, { $strLenCP: { $toString: "$suffix" } }, 6] },
      { $toString: "$suffix" }
    ] }] } } },
    { $group: { _id: null, highest: { $max: "$suffix" }, invalid: { $sum: { $cond: [{ $and: [
      { $regexMatch: { input: "$value", regex: "^Lisno[0-9]{6,16}$" } },
      { $gte: ["$suffix", 1] }, { $lte: ["$suffix", Number.MAX_SAFE_INTEGER] },
      { $eq: ["$suffix", { $trunc: "$suffix" }] }, { $eq: ["$value", "$expected"] }
    ] }, 0, 1] } } } }
  ];
}

/** Only aggregate numbering metadata; audit history protects numbers whose Lead was deleted. */
async function issuedNumberState(session: ClientSession): Promise<number> {
  const [leadState] = await LeadModel.aggregate<{ highest: number; invalid: number }>([
    { $match: { projectNumber: { $exists: true, $ne: null } } }, ...numberStatePipeline("$projectNumber")
  ]).session(session);
  const [auditState] = await AuditEventModel.aggregate<{ highest: number; invalid: number }>([
    { $match: { action: "project_number_assigned" } }, ...numberStatePipeline("$newValues.projectNumber")
  ]).session(session);
  if (leadState?.invalid || auditState?.invalid) throw projectNumberStateConflict();
  return Math.max(Number(leadState?.highest ?? 0), Number(auditState?.highest ?? 0));
}

async function currentCounter(session: ClientSession): Promise<number> {
  const highest = await issuedNumberState(session);
  const counter = await ProjectNumberSequenceModel.findById(PROJECT_NUMBER_SEQUENCE_ID).session(session).lean();
  if (!counter) {
    if (highest !== 0) throw projectNumberStateConflict();
    try {
      await ProjectNumberSequenceModel.create([{ _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber: 0 }], { session });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new ProjectNumberInitializationConflict();
      throw error;
    }
    return 0;
  }
  if (!Number.isSafeInteger(counter.lastNumber) || counter.lastNumber < highest || counter.lastNumber < 0) throw projectNumberStateConflict();
  return counter.lastNumber;
}

/** Called only when creating an estimate, within its transaction after request validation. */
export async function assignProjectNumber(input: {
  lead: { id: string; ownerId: string; projectId?: string | null; projectNumber?: unknown };
  estimateId: string;
  actorId: string;
  audit: AuditService;
  session: ClientSession;
}): Promise<string> {
  const { lead, session } = input;
  const issued = parseProjectNumber(lead.projectNumber);
  const assignments = await AuditEventModel.find({
    action: "project_number_assigned", entityType: "lead", entityId: lead.id
  }).select({ _id: 0, "newValues.leadId": 1, "newValues.projectNumber": 1 }).limit(2).session(session).lean();
  if (assignments.length > 1 || assignments.some(event =>
    event.newValues?.leadId !== lead.id || issued === null || parseProjectNumber(event.newValues?.projectNumber) !== issued
  )) throw projectNumberStateConflict();
  const lastNumber = await currentCounter(session);
  if (issued !== null && issued > lastNumber) throw projectNumberStateConflict();
  if (issued === null && lastNumber === Number.MAX_SAFE_INTEGER) {
    throw new ApiError(409, "PROJECT_NUMBER_EXHAUSTED", "The project numbering sequence has reached its supported limit.");
  }
  const projectNumber = formatProjectNumber(issued ?? lastNumber + 1);
  if (issued === null) {
    const counter = await ProjectNumberSequenceModel.updateOne(
      { _id: PROJECT_NUMBER_SEQUENCE_ID, lastNumber }, { $inc: { lastNumber: 1 } }, { session, runValidators: true }
    );
    if (counter.matchedCount !== 1) throw projectNumberStateConflict();
  }
  const occurredAt = new Date();
  try {
    const assigned = await LeadModel.updateOne(
      { _id: lead.id, ownerId: lead.ownerId, projectId: lead.projectId ?? null, projectNumber: issued === null ? null : projectNumber },
      { $set: { projectNumber, updatedAt: occurredAt } },
      { session, runValidators: true, overwriteImmutable: true }
    );
    if (assigned.matchedCount !== 1) throw projectNumberStateConflict();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) throw projectNumberStateConflict();
    throw error;
  }
  if (issued === null) await input.audit.appendInMongoTransaction({
    actorId: input.actorId, action: "project_number_assigned", entityType: "lead", entityId: lead.id,
    occurredAt: occurredAt.toISOString(), newValues: {
      leadId: lead.id, estimateId: input.estimateId, projectId: lead.projectId ?? null, projectNumber
    }
  }, session);
  return projectNumber;
}
