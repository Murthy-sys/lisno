import { createHash, randomBytes, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";

import type { VendorKpiAssessment, VendorKpiDirectorySummary, VendorKpiPublicInspection, VendorKpiPublicSubmitInput, VendorKpiRequestInput, VendorKpiRequestView, VendorKpiSaveInput, VendorKpiStaffDetail, VendorKpiSubmissionReceipt } from "../contracts/vendor-kpi.js";
import { calculateVendorKpi, orderedVendorKpiScores, VENDOR_KPI_RUBRIC_VERSION, type VendorKpiVendorType } from "../domain/vendor-kpi.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { VendorKpiAssessmentModel } from "../models/VendorKpiAssessment.js";
import { VendorKpiRequestModel } from "../models/VendorKpiRequest.js";
import { aiEstimatorKnowledgeVendorActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { VendorKpiMailer } from "./vendor-kpi-mailer.js";

type Row = Record<string, any>;
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 15 * 60 * 1_000;
const PENDING_TIMEOUT_MS = 2 * 60 * 1_000;
const emailSchema = z.string().trim().email().max(320);
const transaction = <T>(operation: (session: ClientSession) => Promise<T>) => mongoose.connection.transaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const profile = (vendor: Row) => vendor.procurementProfile as Row | undefined;
const typeOf = (vendor: Row): VendorKpiVendorType | null => ["execution", "supplier"].includes(profile(vendor)?.vendorType) ? profile(vendor)!.vendorType as VendorKpiVendorType : null;
const generation = (vendor: Row) => Number(vendor.kpiRubricGeneration ?? 0);
const emailOf = (vendor: Row) => emailSchema.safeParse(profile(vendor)?.email).success ? String(profile(vendor)!.email).trim().toLowerCase() : null;
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const unavailable = (): never => { throw new ApiError(410, "VENDOR_KPI_LINK_UNAVAILABLE", "This assessment link is unavailable. Request a new link from the Procurement team."); };
const conflict = (code = "VENDOR_KPI_VERSION_CONFLICT"): never => { throw new ApiError(409, code, "This Vendor KPI changed. Reload the latest details before saving."); };
const notFound = (): never => { throw new ApiError(404, "NOT_FOUND", "Vendor not found."); };
const payloadHash = (type: VendorKpiVendorType, scores: readonly { key: string; score: number }[], comment: string | null) => sha256(JSON.stringify({ type, scores: orderedVendorKpiScores(type, scores), comment }));

function assessmentDto(row: Row | null): VendorKpiAssessment | null {
  if (!row) return null;
  return { id: String(row._id), vendorId: String(row.vendorId), source: row.source, vendorType: row.vendorType,
    rubricVersion: Number(row.rubricVersion), scores: row.scores.map((score: Row) => ({ key: String(score.key), score: Number(score.score) })),
    averageScoreBps: Number(row.averageScoreBps), revision: Number(row.revision), comment: row.comment ?? null, submittedAt: iso(row.submittedAt) };
}

function requestDto(row: Row | null, now: Date): VendorKpiRequestView | null {
  if (!row) return null;
  const status = row.status === "sent" && new Date(row.expiresAt) <= now ? "expired" : row.status;
  return { status, version: Number(row.version), requestedAt: iso(row.requestedAt), expiresAt: iso(row.expiresAt),
    sentAt: row.sentAt ? iso(row.sentAt) : null,
    canResendAt: row.status === "sent" && status !== "expired" ? new Date(new Date(row.requestedAt).getTime() + RESEND_COOLDOWN_MS).toISOString() : null };
}

async function currentAssessment(vendor: Row, source: "vendor_self" | "procurement", session?: ClientSession): Promise<Row | null> {
  const vendorType = typeOf(vendor);
  if (!vendorType) return null;
  const query = VendorKpiAssessmentModel.findOne({ vendorId: String(vendor._id), source, vendorType, rubricVersion: VENDOR_KPI_RUBRIC_VERSION, rubricGeneration: generation(vendor) }).sort({ revision: -1 });
  if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function latestRequest(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorKpiRequestModel.findOne({ vendorId }).sort({ version: -1 });
  if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function readVendor(vendorId: string, session?: ClientSession): Promise<Row> {
  const query = AiEstimatorKnowledgeVendorModel.findById(vendorId);
  if (session) query.session(session);
  const vendor = await query.lean().exec() as Row | null;
  if (!vendor) notFound();
  return vendor!;
}
async function lockVendor(vendorId: string, session: ClientSession): Promise<Row> {
  const row = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, status: { $ne: "archived" } }, { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean().exec() as Row | null;
  if (!row) throw new ApiError(409, "VENDOR_KPI_VENDOR_UNAVAILABLE", "This vendor is archived or unavailable.");
  return row;
}
async function publicVendor(vendorId: string, session: ClientSession): Promise<Row> {
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session).lean().exec() as Row | null;
  if (!vendor || vendor.status === "archived") unavailable();
  return vendor!;
}
async function lockPublicVendor(vendorId: string, session: ClientSession): Promise<Row> {
  const vendor = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, status: { $ne: "archived" } },
    { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean().exec() as Row | null;
  if (!vendor) unavailable();
  return vendor!;
}
function validRequest(request: Row, vendor: Row, now: Date): boolean {
  return request.status === "sent" && new Date(request.expiresAt) > now && vendor.status !== "archived" &&
    request.vendorType === typeOf(vendor) && request.rubricVersion === VENDOR_KPI_RUBRIC_VERSION && request.rubricGeneration === generation(vendor) &&
    !!emailOf(vendor) && request.recipientEmailHash === sha256(emailOf(vendor)!);
}
async function detail(vendor: Row, now: Date, session?: ClientSession): Promise<VendorKpiStaffDetail> {
  // A ClientSession cannot run parallel operations inside one transaction.
  const self = await currentAssessment(vendor, "vendor_self", session);
  const staff = await currentAssessment(vendor, "procurement", session);
  const request = await latestRequest(String(vendor._id), session);
  const basketNames = await selectedBasketNames(vendor, session);
  const requestView = requestDto(request, now);
  const selfAssessment = assessmentDto(self);
  const procurementAssessment = assessmentDto(staff);
  let eligibility: VendorKpiStaffDetail["requestEligibility"] = "ready";
  if (vendor.status === "archived") eligibility = "archived";
  else if (selfAssessment) eligibility = "self_submitted";
  else if (!typeOf(vendor) || !emailOf(vendor)) eligibility = "missing_profile";
  else if (request?.status === "pending" && now.getTime() - new Date(request.requestedAt).getTime() < PENDING_TIMEOUT_MS) eligibility = "pending";
  else if (request?.status === "sent" && new Date(request.expiresAt) > now && now.getTime() - new Date(request.requestedAt).getTime() < RESEND_COOLDOWN_MS) eligibility = "cooldown";
  return { vendor: { id: String(vendor._id), code: String(vendor.code), name: String(vendor.name), status: vendor.status,
    vendorType: typeOf(vendor), workProfile: typeof profile(vendor)?.workProfile === "string" ? profile(vendor)!.workProfile : null,
    mainBasketNames: basketNames.mainBasketNames,
    subBasketNames: basketNames.subBasketNames,
    emailAvailable: !!emailOf(vendor) }, rubricVersion: VENDOR_KPI_RUBRIC_VERSION,
    selfAssessment, procurementAssessment, officialScoreBps: procurementAssessment?.averageScoreBps ?? null,
    request: requestView, requestEligibility: eligibility };
}

export async function vendorKpiDirectorySummaries(vendors: readonly Row[], session?: ClientSession): Promise<Map<string, VendorKpiDirectorySummary>> {
  const ids = vendors.map(row => String(row._id));
  if (!ids.length) return new Map();
  const query = VendorKpiAssessmentModel.find({ vendorId: { $in: ids }, rubricVersion: VENDOR_KPI_RUBRIC_VERSION }).sort({ revision: -1 }).select({ vendorId: 1, source: 1, vendorType: 1, rubricGeneration: 1, averageScoreBps: 1 });
  if (session) query.session(session);
  const rows = await query.lean().exec() as Row[];
  const current = new Map<string, VendorKpiDirectorySummary>();
  for (const vendor of vendors) current.set(String(vendor._id), { status: "not_rated", officialScoreBps: null, selfStatus: "not_submitted" });
  for (const row of rows) {
    const vendor = vendors.find(item => String(item._id) === String(row.vendorId));
    if (!vendor || typeOf(vendor) !== row.vendorType || generation(vendor) !== Number(row.rubricGeneration)) continue;
    const previous = current.get(String(row.vendorId))!;
    if (row.source === "vendor_self" && previous.selfStatus === "not_submitted") current.set(String(row.vendorId), { ...previous, selfStatus: "submitted" });
    if (row.source === "procurement" && previous.status === "not_rated") current.set(String(row.vendorId), { ...previous, status: "rated", officialScoreBps: Number(row.averageScoreBps) });
  }
  return current;
}

export interface VendorKpiService {
  read(actor: PublicUser, vendorId: string): Promise<VendorKpiStaffDetail>;
  save(actor: PublicUser, vendorId: string, input: VendorKpiSaveInput): Promise<VendorKpiStaffDetail>;
  request(actor: PublicUser, vendorId: string, input: VendorKpiRequestInput): Promise<VendorKpiStaffDetail>;
  inspect(token: string): Promise<VendorKpiPublicInspection>;
  submit(input: VendorKpiPublicSubmitInput): Promise<VendorKpiSubmissionReceipt>;
}

export function createVendorKpiService({ audit, mailer, now = () => new Date() }: { audit: AuditService; mailer: VendorKpiMailer; now?: () => Date }): VendorKpiService {
  return {
    async read(actor, vendorId) {
      await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor);
      return detail(await readVendor(vendorId), now());
    },
    async save(actor, vendorId, input) {
      return transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const vendorType = typeOf(vendor);
        if (!vendorType) throw new ApiError(409, "VENDOR_KPI_PROFILE_REQUIRED", "Complete the vendor type before rating.");
        if (input.rubricVersion !== VENDOR_KPI_RUBRIC_VERSION) conflict("VENDOR_KPI_RUBRIC_CONFLICT");
        const comment = input.comment?.trim() || null;
        const scores = orderedVendorKpiScores(vendorType, input.scores);
        const hash = payloadHash(vendorType, scores, comment);
        const prior = await VendorKpiAssessmentModel.findOne({ vendorId, source: "procurement", idempotencyKey: input.idempotencyKey }).session(session).lean().exec() as Row | null;
        if (prior) {
          if (prior.payloadHash !== hash || prior.actorId !== actor.id) conflict("VENDOR_KPI_IDEMPOTENCY_CONFLICT");
          return detail(vendor, now(), session);
        }
        const current = await currentAssessment(vendor, "procurement", session);
        if ((current?.revision ?? null) !== input.expectedRevision) conflict();
        const timestamp = now();
        const [created] = await VendorKpiAssessmentModel.create([{ _id: `vendor-kpi-${randomUUID()}`, vendorId, source: "procurement", vendorType,
          rubricVersion: VENDOR_KPI_RUBRIC_VERSION, rubricGeneration: generation(vendor), scores,
          averageScoreBps: calculateVendorKpi(vendorType, scores), revision: (current?.revision ?? 0) + 1,
          comment, submittedAt: timestamp, actorId: actor.id, requestId: null,
          idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_kpi.procurement_saved", entityType: "vendor_kpi", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { assessmentId: current?._id ?? null, revision: current?.revision ?? null },
          newValues: { assessmentId: String(created!._id), revision: (current?.revision ?? 0) + 1, averageScoreBps: calculateVendorKpi(vendorType, scores) } }, session);
        return detail(vendor, timestamp, session);
      });
    },
    async request(actor, vendorId, input) {
      await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor);
      if (mailer.deliveryKind === "disabled") throw new ApiError(503, "VENDOR_KPI_MAIL_UNAVAILABLE", "Vendor KPI email delivery is unavailable.");
      const prepared = await transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const vendorType = typeOf(vendor);
        const recipientEmail = emailOf(vendor);
        if (!vendorType || !recipientEmail) throw new ApiError(409, "VENDOR_KPI_PROFILE_REQUIRED", "Complete the vendor type and email before requesting the KPI.");
        if (await currentAssessment(vendor, "vendor_self", session)) throw new ApiError(409, "VENDOR_KPI_SELF_SUBMITTED", "This vendor has already submitted the current KPI.");
        const previous = await latestRequest(vendorId, session);
        if (previous?.idempotencyKey === input.idempotencyKey) {
          if (previous.requestedById !== actor.id || (previous.version - 1 || null) !== input.expectedRequestVersion) conflict("VENDOR_KPI_IDEMPOTENCY_CONFLICT");
          if (previous.status === "pending" && now().getTime() - new Date(previous.requestedAt).getTime() >= PENDING_TIMEOUT_MS) {
            const timestamp = now();
            const failed = await VendorKpiRequestModel.updateOne({ _id: previous._id, status: "pending" }, { $set: { status: "failed" } }, { session });
            if (failed.modifiedCount === 1) await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_kpi.delivery_failed",
              entityType: "vendor_kpi", entityId: vendorId, occurredAt: timestamp.toISOString(),
              newValues: { requestId: String(previous._id), version: previous.version, status: "failed", reason: "delivery_unconfirmed" } }, session);
          }
          return { replay: true as const };
        }
        if ((previous?.version ?? null) !== input.expectedRequestVersion) conflict();
        const timestamp = now();
        if (previous?.status === "pending" && timestamp.getTime() - new Date(previous.requestedAt).getTime() < PENDING_TIMEOUT_MS)
          throw new ApiError(409, "VENDOR_KPI_REQUEST_PENDING", "A vendor KPI request is already being sent.");
        if (previous?.status === "sent" && new Date(previous.expiresAt) > timestamp && timestamp.getTime() - new Date(previous.requestedAt).getTime() < RESEND_COOLDOWN_MS)
          throw new ApiError(429, "VENDOR_KPI_REQUEST_COOLDOWN", "Please wait before resending the vendor KPI request.");
        if (previous && ["pending", "sent"].includes(previous.status)) await VendorKpiRequestModel.updateOne({ _id: previous._id, status: previous.status }, { $set: { status: "superseded" } }, { session });
        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(timestamp.getTime() + TOKEN_LIFETIME_MS);
        const [created] = await VendorKpiRequestModel.create([{ _id: `vendor-kpi-request-${randomUUID()}`, vendorId, version: (previous?.version ?? 0) + 1,
          tokenHash: sha256(rawToken), recipientEmailHash: sha256(recipientEmail), vendorType, rubricVersion: VENDOR_KPI_RUBRIC_VERSION,
          rubricGeneration: generation(vendor), status: "pending", requestedAt: timestamp, expiresAt, sentAt: null, consumedAt: null,
          requestedById: actor.id, idempotencyKey: input.idempotencyKey, submissionKey: null, submissionHash: null }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_kpi.requested", entityType: "vendor_kpi", entityId: vendorId,
          occurredAt: timestamp.toISOString(), newValues: { requestId: String(created!._id), version: (previous?.version ?? 0) + 1 } }, session);
        return { replay: false as const, requestId: String(created!._id), rawToken, recipient: { name: String(vendor.name), email: recipientEmail }, expiresAt: expiresAt.toISOString() };
      });
      if (prepared.replay) return this.read(actor, vendorId);
      let delivered = false;
      try { await mailer.sendRequest({ recipient: prepared.recipient, rawToken: prepared.rawToken, expiresAt: prepared.expiresAt }); delivered = true; }
      catch { /* Persist a failed, unusable generation without leaking transport details. */ }
      await transaction(async session => {
        const vendor = await readVendor(vendorId, session);
        const row = await VendorKpiRequestModel.findById(prepared.requestId).session(session).lean().exec() as Row | null;
        if (!row || row.status !== "pending") return;
        const current = await latestRequest(vendorId, session);
        const safe = delivered && current?._id === row._id && vendor.status !== "archived" && row.vendorType === typeOf(vendor) &&
          row.rubricGeneration === generation(vendor) && row.recipientEmailHash === sha256(emailOf(vendor) ?? "") && !await currentAssessment(vendor, "vendor_self", session);
        const status = safe ? "sent" : "failed";
        const timestamp = now();
        await VendorKpiRequestModel.updateOne({ _id: row._id, status: "pending" }, { $set: { status, sentAt: safe ? timestamp : null } }, { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: safe ? "vendor_kpi.delivery_sent" : "vendor_kpi.delivery_failed",
          entityType: "vendor_kpi", entityId: vendorId, occurredAt: timestamp.toISOString(), newValues: { requestId: row._id, version: row.version, status } }, session);
      });
      return this.read(actor, vendorId);
    },
    async inspect(token) {
      return transaction(async session => {
        const request = await tokenRequest(token, session);
        const vendor = await publicVendor(String(request.vendorId), session);
        if (!validRequest(request, vendor, now()) || (await latestRequest(String(vendor._id), session))?._id !== request._id || await currentAssessment(vendor, "vendor_self", session)) unavailable();
        const basketNames = await selectedBasketNames(vendor, session);
        return { vendor: { name: String(vendor.name), code: String(vendor.code), vendorType: typeOf(vendor)!,
          workProfile: typeof profile(vendor)?.workProfile === "string" ? profile(vendor)!.workProfile : "",
          mainBasketNames: basketNames.mainBasketNames,
          subBasketNames: basketNames.subBasketNames },
          rubricVersion: VENDOR_KPI_RUBRIC_VERSION, expiresAt: iso(request.expiresAt) };
      });
    },
    async submit(input) {
      return transaction(async session => {
        const request = await tokenRequest(input.token, session);
        const comment = input.comment?.trim() || null;
        const hash = payloadHash(request.vendorType, input.scores, comment);
        const existingVendor = await publicVendor(String(request.vendorId), session);
        if (request.vendorType !== typeOf(existingVendor) || request.rubricGeneration !== generation(existingVendor) ||
          request.recipientEmailHash !== sha256(emailOf(existingVendor) ?? "")) unavailable();
        if (request.status === "consumed" && request.submissionKey === input.idempotencyKey && request.submissionHash === hash && request.receipt)
          return { submittedAt: request.receipt.submittedAt, averageScoreBps: Number(request.receipt.averageScoreBps) };
        const vendor = await lockPublicVendor(String(request.vendorId), session);
        if (!validRequest(request, vendor, now()) || (await latestRequest(String(vendor._id), session))?._id !== request._id || await currentAssessment(vendor, "vendor_self", session)) unavailable();
        if (input.rubricVersion !== VENDOR_KPI_RUBRIC_VERSION) unavailable();
        const scores = orderedVendorKpiScores(request.vendorType, input.scores);
        const timestamp = now();
        const receipt = { submittedAt: timestamp.toISOString(), averageScoreBps: calculateVendorKpi(request.vendorType, scores) };
        const consumed = await VendorKpiRequestModel.updateOne({ _id: request._id, status: "sent", tokenHash: request.tokenHash },
          { $set: { status: "consumed", consumedAt: timestamp, submissionKey: input.idempotencyKey, submissionHash: hash, receipt } }, { session });
        if (consumed.modifiedCount !== 1) unavailable();
        const [created] = await VendorKpiAssessmentModel.create([{ _id: `vendor-kpi-${randomUUID()}`, vendorId: String(vendor._id), source: "vendor_self",
          vendorType: request.vendorType, rubricVersion: VENDOR_KPI_RUBRIC_VERSION, rubricGeneration: request.rubricGeneration,
          scores, averageScoreBps: receipt.averageScoreBps, revision: 1, comment, submittedAt: timestamp,
          actorId: null, requestId: String(request._id), idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: `vendor:${String(vendor._id)}`, action: "vendor_kpi.self_submitted", entityType: "vendor_kpi", entityId: String(vendor._id),
          occurredAt: timestamp.toISOString(), newValues: { requestId: String(request._id), assessmentId: String(created!._id), revision: 1, averageScoreBps: receipt.averageScoreBps } }, session);
        return receipt;
      });
    }
  };
}

async function tokenRequest(rawToken: string, session: ClientSession): Promise<Row> {
  if (typeof rawToken !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) unavailable();
  const request = await VendorKpiRequestModel.findOne({ tokenHash: sha256(rawToken) }).session(session).lean().exec() as Row | null;
  if (!request) unavailable();
  return request!;
}

async function selectedBasketNames(vendor: Row, session?: ClientSession): Promise<{ mainBasketNames: string[]; subBasketNames: string[] }> {
  const stored = profile(vendor);
  const mainIds: string[] = Array.isArray(stored?.mainBasketIds) ? stored.mainBasketIds : stored?.mainBasketId ? [stored.mainBasketId] : [];
  const subIds: string[] = Array.isArray(stored?.subBasketIds) ? stored.subBasketIds : stored?.subBasketId ? [stored.subBasketId] : [];
  const mainQuery = AiEstimatorKnowledgeBasketModel.find({ _id: { $in: mainIds } }).select({ _id: 1, name: 1 });
  if (session) mainQuery.session(session);
  const mains = await mainQuery.lean().exec();
  const subQuery = AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subIds }, basketId: { $in: mainIds } }).select({ _id: 1, name: 1 });
  if (session) subQuery.session(session);
  const subs = await subQuery.lean().exec();
  const mainNames = new Map(mains.map(row => [String(row._id), String(row.name)]));
  const subNames = new Map(subs.map(row => [String(row._id), String(row.name)]));
  return { mainBasketNames: mainIds.flatMap(id => mainNames.has(id) ? [mainNames.get(id)!] : []),
    subBasketNames: subIds.flatMap(id => subNames.has(id) ? [subNames.get(id)!] : []) };
}
