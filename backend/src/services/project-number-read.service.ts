import type { ClientSession } from "mongoose";
import { projectNumbersForProjectIds } from "../domain/project-number.js";
import { LeadModel } from "../models/Lead.js";

/** Batch identity metadata for project IDs whose access the caller has already checked. */
export async function readProjectNumbers(
  projectIds: readonly string[],
  session?: ClientSession
): Promise<Map<string, string | null>> {
  const ids = [...new Set(projectIds)];
  if (!ids.length) return new Map();
  const query = LeadModel.find({ projectId: { $in: ids } })
    .select({ _id: 0, projectId: 1, projectNumber: 1 });
  if (session) query.session(session);
  const leads = await query.lean<Array<{ projectId: string; projectNumber?: unknown }>>().exec();
  return projectNumbersForProjectIds(ids, leads);
}
