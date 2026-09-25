import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { ProcurementVendorSaveCommandModel } from "../models/ProcurementVendorSaveCommand.js";
import { procurementVendorProfileSchema } from "./procurement-vendor-profile.js";

export interface VendorSaveCommand { id: string; fingerprint: string }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}
export function vendorSaveCommand(actorId: string, vendorId: string | null, input: object & { idempotencyKey?: string; procurementProfile?: unknown }): VendorSaveCommand | null {
  if (input.idempotencyKey === undefined) return null;
  const { idempotencyKey, ...normalized } = input as Record<string, unknown>;
  if (normalized.procurementProfile !== undefined) {
    const parsed = procurementVendorProfileSchema.safeParse(normalized.procurementProfile);
    if (parsed.success) normalized.procurementProfile = parsed.data;
  }
  for (const key of ["name", "code"]) if (typeof normalized[key] === "string") normalized[key] = (normalized[key] as string).normalize("NFKC").trim().replace(/\s+/gu, " ");
  return { id: createHash("sha256").update(JSON.stringify([actorId, vendorId === null ? "create" : "update", vendorId, idempotencyKey])).digest("hex"),
    fingerprint: createHash("sha256").update(JSON.stringify(stable(normalized))).digest("hex") };
}
export async function readVendorSaveCommand<T>(command: VendorSaveCommand | null, session?: ClientSession): Promise<T | null> {
  if (!command) return null;
  const query = ProcurementVendorSaveCommandModel.findById(command.id);
  if (session) query.session(session);
  const row = await query.lean().exec();
  if (!row) return null;
  if (row.fingerprint !== command.fingerprint) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This vendor save identity was used with different input.");
  return row.result as T;
}
export async function recordVendorSaveCommand(command: VendorSaveCommand | null, result: object, session: ClientSession): Promise<void> {
  if (command) await ProcurementVendorSaveCommandModel.create([{ _id: command.id, fingerprint: command.fingerprint, result }], { session });
}
