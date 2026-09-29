import { createHash, randomBytes, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";

import type { VendorActivation, VendorInductionAnswer, VendorInductionDraft, VendorInductionDraftSaveInput, VendorInductionPublicInspection, VendorInductionPublicSubmitInput, VendorInductionPublishInput, VendorInductionQuestion, VendorInductionQuestionnaire, VendorInductionReopenInput, VendorInductionRequestInput, VendorInductionRequestView, VendorInductionReview, VendorInductionReviewInput, VendorInductionStaffDetail, VendorInductionSubmission, VendorInductionSubmissionReceipt } from "../contracts/vendor-induction.js";
import { validateVendorInductionAnswers, validateVendorInductionQuestions } from "../domain/vendor-induction.js";
import type { VendorKpiVendorType } from "../domain/vendor-kpi.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { VendorInductionDraftModel, VendorInductionQuestionnaireModel, VendorInductionRequestModel, VendorInductionReviewModel, VendorInductionSubmissionModel } from "../models/VendorInduction.js";
import { aiEstimatorKnowledgeVendorActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { VendorInductionMailer } from "./vendor-induction-mailer.js";
export { currentVendorInductionApproval, vendorInductionApprovals } from "./vendor-induction-read.js";

type Row = Record<string, any>;
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;
const PENDING_TIMEOUT_MS = 2 * 60 * 1000;
const emailSchema = z.string().trim().email().max(320);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
const typeOf = (vendor: Row): VendorKpiVendorType | null => ["execution", "supplier"].includes(vendor.procurementProfile?.vendorType) ? vendor.procurementProfile.vendorType : null;
const emailOf = (vendor: Row): string | null => emailSchema.safeParse(vendor.procurementProfile?.email).success ? String(vendor.procurementProfile.email).trim().toLowerCase() : null;
const text = (value: unknown) => typeof value === "string" ? value : "";
const transaction = <T>(operation: (session: ClientSession) => Promise<T>) => mongoose.connection.transaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });
const conflict = (code = "VENDOR_INDUCTION_VERSION_CONFLICT"): never => { throw new ApiError(409, code, "Vendor induction changed. Reload the latest details before saving."); };
const unavailable = (): never => { throw new ApiError(410, "VENDOR_INDUCTION_LINK_UNAVAILABLE", "This induction link is unavailable. Request a new link from Procurement."); };
const notFound = (): never => { throw new ApiError(404, "NOT_FOUND", "Vendor not found."); };
const payloadHash = (value: unknown) => sha256(JSON.stringify(value));
const questionsOf = (row: Row) => row.questions as VendorInductionQuestion[];

async function vendorById(vendorId: string, session?: ClientSession): Promise<Row> {
  const query = AiEstimatorKnowledgeVendorModel.findById(vendorId);
  if (session) query.session(session);
  const vendor = await query.lean().exec() as Row | null;
  if (!vendor) notFound();
  return vendor!;
}
async function lockVendor(vendorId: string, session: ClientSession, publicAccess = false): Promise<Row> {
  const vendor = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, status: { $ne: "archived" } },
    { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean().exec() as Row | null;
  if (!vendor) publicAccess ? unavailable() : conflict("VENDOR_INDUCTION_VENDOR_UNAVAILABLE");
  return vendor!;
}
async function latestDraft(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorInductionDraftModel.findOne({ vendorId }).sort({ version: -1 }); if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function latestPublished(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorInductionQuestionnaireModel.findOne({ vendorId }).sort({ version: -1 }); if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function latestRequest(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorInductionRequestModel.findOne({ vendorId }).sort({ version: -1 }); if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function latestReview(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorInductionReviewModel.findOne({ vendorId }).sort({ version: -1 }); if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
async function latestSubmission(vendorId: string, session?: ClientSession): Promise<Row | null> {
  const query = VendorInductionSubmissionModel.findOne({ vendorId }).sort({ submittedAt: -1 }); if (session) query.session(session);
  return await query.lean().exec() as Row | null;
}
const draftDto = (row: Row | null): VendorInductionDraft | null => row && ({ version: Number(row.version), vendorType: row.vendorType,
  questions: questionsOf(row), updatedAt: iso(row.updatedAt) });
const publishedDto = (row: Row | null): VendorInductionQuestionnaire | null => row && ({ id: String(row._id),
  version: Number(row.version), vendorType: row.vendorType, questions: questionsOf(row), publishedAt: iso(row.publishedAt) });
const submissionDto = (row: Row | null): VendorInductionSubmission | null => row && ({ id: String(row._id),
  requestId: String(row.requestId), questionnaireVersion: Number(row.questionnaireVersion), questionnaire: row.questionnaire as VendorInductionQuestionnaire,
  answers: row.answers as VendorInductionAnswer[],
  submittedAt: iso(row.submittedAt) });
const reviewDto = (row: Row | null): VendorInductionReview | null => row && ({ id: String(row._id), submissionId: String(row.submissionId),
  decision: row.decision, reason: row.reason ?? null, actorId: String(row.actorId), reviewedAt: iso(row.reviewedAt), version: Number(row.version) });
function requestDto(row: Row | null, now: Date): VendorInductionRequestView | null {
  if (!row) return null;
  const status = row.status === "sent" && new Date(row.expiresAt) <= now ? "expired" : row.status;
  return { status, version: Number(row.version), requestedAt: iso(row.requestedAt), expiresAt: iso(row.expiresAt),
    sentAt: row.sentAt ? iso(row.sentAt) : null,
    canResendAt: status === "sent" ? new Date(new Date(row.requestedAt).getTime() + RESEND_COOLDOWN_MS).toISOString() : null };
}
const currentApproval = (review: Row | null, type: VendorKpiVendorType | null) => !!review && review.decision === "approved" && review.vendorType === type;
function validRequest(request: Row, vendor: Row, now: Date): boolean {
  return request.status === "sent" && new Date(request.expiresAt) > now && vendor.status !== "archived" &&
    request.vendorType === typeOf(vendor) && !!emailOf(vendor) && request.recipientEmailHash === sha256(emailOf(vendor)!);
}
async function detail(vendor: Row, now: Date, activationForVendor: (vendor: Row, session?: ClientSession) => Promise<VendorActivation>, session?: ClientSession): Promise<VendorInductionStaffDetail> {
  const vendorId = String(vendor._id);
  // Mongo sessions do not support concurrent operations on one transaction.
  const draft = await latestDraft(vendorId, session);
  const published = await latestPublished(vendorId, session);
  const request = await latestRequest(vendorId, session);
  const submission = await latestSubmission(vendorId, session);
  const review = await latestReview(vendorId, session);
  const submissionQuery = VendorInductionSubmissionModel.find({ vendorId }).sort({ submittedAt: -1 });
  if (session) submissionQuery.session(session);
  const submissions = await submissionQuery.lean().exec() as Row[];
  const reviewQuery = VendorInductionReviewModel.find({ vendorId }).sort({ version: -1 });
  if (session) reviewQuery.session(session);
  const reviews = await reviewQuery.lean().exec() as Row[];
  const vendorType = typeOf(vendor);
  let requestEligibility: VendorInductionStaffDetail["requestEligibility"] = "ready";
  if (vendor.status === "archived") requestEligibility = "archived";
  else if (currentApproval(review, vendorType)) requestEligibility = "approved";
  else if (!vendorType || !emailOf(vendor)) requestEligibility = "missing_profile";
  else if (!published || published.vendorType !== vendorType) requestEligibility = "no_published_questionnaire";
  else if (submission && request?.status === "consumed" && request._id === submission.requestId && (!review || review.submissionId !== submission._id)) requestEligibility = "awaiting_review";
  else if (request?.status === "pending" && now.getTime() - new Date(request.requestedAt).getTime() < PENDING_TIMEOUT_MS) requestEligibility = "pending";
  else if (request?.status === "sent" && new Date(request.expiresAt) > now && now.getTime() - new Date(request.requestedAt).getTime() < RESEND_COOLDOWN_MS) requestEligibility = "cooldown";
  return { vendor: { id: vendorId, name: String(vendor.name), vendorType, emailAvailable: !!emailOf(vendor) },
    activation: await activationForVendor(vendor, session),
    draft: draft?.vendorType === vendorType ? draftDto(draft) : null,
    published: published?.vendorType === vendorType ? publishedDto(published) : null,
    request: requestDto(request, now), requestEligibility,
    submission: submissionDto(submission), review: reviewDto(review),
    history: { submissions: submissions.map(row => submissionDto(row)!), reviews: reviews.map(row => reviewDto(row)!) } };
}

export interface VendorInductionService {
  read(actor: PublicUser, vendorId: string): Promise<VendorInductionStaffDetail>;
  saveDraft(actor: PublicUser, vendorId: string, input: VendorInductionDraftSaveInput): Promise<VendorInductionStaffDetail>;
  publish(actor: PublicUser, vendorId: string, input: VendorInductionPublishInput): Promise<VendorInductionStaffDetail>;
  request(actor: PublicUser, vendorId: string, input: VendorInductionRequestInput): Promise<VendorInductionStaffDetail>;
  review(actor: PublicUser, vendorId: string, input: VendorInductionReviewInput): Promise<VendorInductionStaffDetail>;
  reopen(actor: PublicUser, vendorId: string, input: VendorInductionReopenInput): Promise<VendorInductionStaffDetail>;
  inspect(token: string): Promise<VendorInductionPublicInspection>;
  submit(input: VendorInductionPublicSubmitInput): Promise<VendorInductionSubmissionReceipt>;
}

export function createVendorInductionService({ audit, mailer, activationForVendor, now = () => new Date() }: {
  audit: AuditService; mailer: VendorInductionMailer; activationForVendor: (vendor: Row, session?: ClientSession) => Promise<VendorActivation>; now?: () => Date;
}): VendorInductionService {
  return {
    async read(actor, vendorId) { await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor); return detail(await vendorById(vendorId), now(), activationForVendor); },
    async saveDraft(actor, vendorId, input) {
      const normalized = validateVendorInductionQuestions(input.questions);
      const hash = payloadHash({ vendorType: input.vendorType, questions: normalized });
      return transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        if (typeOf(vendor) !== input.vendorType) conflict("VENDOR_INDUCTION_TYPE_CONFLICT");
        const replay = await VendorInductionDraftModel.findOne({ vendorId, idempotencyKey: input.idempotencyKey }).session(session).lean().exec() as Row | null;
        if (replay) {
          if (replay.payloadHash !== hash || replay.actorId !== actor.id || replay.version - 1 !== (input.expectedVersion ?? 0)) conflict("VENDOR_INDUCTION_IDEMPOTENCY_CONFLICT");
          return detail(vendor, now(), activationForVendor, session);
        }
        const previous = await latestDraft(vendorId, session);
        if ((previous?.version ?? null) !== input.expectedVersion) conflict();
        const timestamp = now();
        const [created] = await VendorInductionDraftModel.create([{ _id: `vendor-induction-draft-${randomUUID()}`, vendorId,
          version: (previous?.version ?? 0) + 1, vendorType: input.vendorType, questions: normalized,
          updatedAt: timestamp, actorId: actor.id, idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_induction.draft_saved", entityType: "vendor_induction", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { draftVersion: previous?.version ?? null }, newValues: { draftId: String(created!._id), draftVersion: (previous?.version ?? 0) + 1 } }, session);
        return detail(vendor, timestamp, activationForVendor, session);
      });
    },
    async publish(actor, vendorId, input) {
      return transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const replay = await VendorInductionQuestionnaireModel.findOne({ vendorId, idempotencyKey: input.idempotencyKey }).session(session).lean().exec() as Row | null;
        if (replay) {
          if (replay.actorId !== actor.id || replay.draftVersion !== input.expectedDraftVersion) conflict("VENDOR_INDUCTION_IDEMPOTENCY_CONFLICT");
          return detail(vendor, now(), activationForVendor, session);
        }
        const draft = await latestDraft(vendorId, session);
        if (!draft || draft.version !== input.expectedDraftVersion || draft.vendorType !== typeOf(vendor)) conflict();
        const activeDraft = draft!;
        const selected = questionsOf(activeDraft).filter(question => question.enabled);
        const normalized = validateVendorInductionQuestions(selected, true);
        const previous = await latestPublished(vendorId, session);
        if (previous?.draftVersion === activeDraft.version) conflict("VENDOR_INDUCTION_ALREADY_PUBLISHED");
        const timestamp = now();
        const [created] = await VendorInductionQuestionnaireModel.create([{ _id: `vendor-induction-questionnaire-${randomUUID()}`,
          vendorId, version: (previous?.version ?? 0) + 1, draftVersion: activeDraft.version, vendorType: activeDraft.vendorType,
          questions: normalized, questionHash: payloadHash(normalized), publishedAt: timestamp, actorId: actor.id,
          idempotencyKey: input.idempotencyKey }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_induction.published", entityType: "vendor_induction", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { version: previous?.version ?? null },
          newValues: { questionnaireId: String(created!._id), version: (previous?.version ?? 0) + 1, questionCount: normalized.length } }, session);
        return detail(vendor, timestamp, activationForVendor, session);
      });
    },
    async request(actor, vendorId, input) {
      await aiEstimatorKnowledgeVendorActorGuard.requireReadActor(actor);
      if (mailer.deliveryKind === "disabled") throw new ApiError(503, "VENDOR_INDUCTION_MAIL_UNAVAILABLE", "Vendor induction email delivery is unavailable.");
      const prepared = await transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const recipientEmail = emailOf(vendor);
        const vendorType = typeOf(vendor);
        if (!vendorType || !recipientEmail) throw new ApiError(409, "VENDOR_INDUCTION_PROFILE_REQUIRED", "Complete the vendor type and email before requesting induction.");
        const published = await latestPublished(vendorId, session);
        if (!published || published.vendorType !== vendorType) throw new ApiError(409, "VENDOR_INDUCTION_NO_QUESTIONNAIRE", "Publish a questionnaire for this vendor first.");
        const review = await latestReview(vendorId, session);
        if (currentApproval(review, vendorType)) throw new ApiError(409, "VENDOR_INDUCTION_ALREADY_APPROVED", "Reopen the approved induction before requesting another response.");
        const previous = await latestRequest(vendorId, session);
        if (previous?.idempotencyKey === input.idempotencyKey) {
          if (previous.requestedById !== actor.id || (previous.version - 1 || null) !== input.expectedRequestVersion) conflict("VENDOR_INDUCTION_IDEMPOTENCY_CONFLICT");
          if (previous.status === "pending" && now().getTime() - new Date(previous.requestedAt).getTime() >= PENDING_TIMEOUT_MS) {
            const timestamp = now();
            const failed = await VendorInductionRequestModel.updateOne({ _id: previous._id, status: "pending" }, { $set: { status: "failed" } }, { session });
            if (failed.modifiedCount === 1) await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_induction.delivery_failed",
              entityType: "vendor_induction", entityId: vendorId, occurredAt: timestamp.toISOString(),
              newValues: { requestId: String(previous._id), version: previous.version, status: "failed", reason: "delivery_unconfirmed" } }, session);
          }
          return { replay: true as const };
        }
        if ((previous?.version ?? null) !== input.expectedRequestVersion) conflict();
        const timestamp = now();
        if (previous?.status === "pending" && timestamp.getTime() - new Date(previous.requestedAt).getTime() < PENDING_TIMEOUT_MS)
          throw new ApiError(409, "VENDOR_INDUCTION_REQUEST_PENDING", "An induction request is already being sent.");
        if (previous?.status === "sent" && new Date(previous.expiresAt) > timestamp && timestamp.getTime() - new Date(previous.requestedAt).getTime() < RESEND_COOLDOWN_MS)
          throw new ApiError(429, "VENDOR_INDUCTION_REQUEST_COOLDOWN", "Please wait before resending the induction request.");
        if (previous?.status === "consumed") {
          const submission = await VendorInductionSubmissionModel.findOne({ requestId: String(previous._id) }).session(session).lean().exec() as Row | null;
          if (submission && (!review || review.submissionId !== submission._id)) throw new ApiError(409, "VENDOR_INDUCTION_AWAITING_REVIEW", "Review the vendor's answers before requesting another response.");
        }
        if (previous && ["pending", "sent"].includes(previous.status)) await VendorInductionRequestModel.updateOne({ _id: previous._id, status: previous.status }, { $set: { status: "superseded" } }, { session });
        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(timestamp.getTime() + TOKEN_LIFETIME_MS);
        const changeNote = review?.decision === "changes_requested" ? review.reason ?? null : null;
        const [created] = await VendorInductionRequestModel.create([{ _id: `vendor-induction-request-${randomUUID()}`, vendorId,
          version: (previous?.version ?? 0) + 1, questionnaireId: String(published._id), questionnaireVersion: published.version,
          questionnairePublishedAt: published.publishedAt,
          questionHash: published.questionHash, questions: published.questions, vendorType,
          tokenHash: sha256(rawToken), recipientEmailHash: sha256(recipientEmail), status: "pending", requestedAt: timestamp,
          expiresAt, sentAt: null, consumedAt: null, requestedById: actor.id, idempotencyKey: input.idempotencyKey,
          changeNote, submissionKey: null, submissionHash: null }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_induction.requested", entityType: "vendor_induction", entityId: vendorId,
          occurredAt: timestamp.toISOString(), newValues: { requestId: String(created!._id), version: (previous?.version ?? 0) + 1,
            questionnaireVersion: published.version } }, session);
        return { replay: false as const, requestId: String(created!._id), rawToken,
          recipient: { name: String(vendor.name), email: recipientEmail }, expiresAt: expiresAt.toISOString(), changeNote };
      });
      if (prepared.replay) return this.read(actor, vendorId);
      let delivered = false;
      try { await mailer.sendRequest({ recipient: prepared.recipient, rawToken: prepared.rawToken, expiresAt: prepared.expiresAt, changeNote: prepared.changeNote }); delivered = true; }
      catch { /* Transport errors are reflected as failed delivery without exposing them. */ }
      await transaction(async session => {
        const row = await VendorInductionRequestModel.findById(prepared.requestId).session(session).lean().exec() as Row | null;
        if (!row || row.status !== "pending") return;
        const vendor = await vendorById(vendorId, session);
        const latest = await latestRequest(vendorId, session);
        const safe = delivered && latest?._id === row._id && vendor.status !== "archived" && row.vendorType === typeOf(vendor) &&
          row.recipientEmailHash === sha256(emailOf(vendor) ?? "");
        const status = safe ? "sent" : "failed"; const timestamp = now();
        await VendorInductionRequestModel.updateOne({ _id: row._id, status: "pending" }, { $set: { status, sentAt: safe ? timestamp : null } }, { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: safe ? "vendor_induction.delivery_sent" : "vendor_induction.delivery_failed",
          entityType: "vendor_induction", entityId: vendorId, occurredAt: timestamp.toISOString(),
          newValues: { requestId: String(row._id), version: row.version, status } }, session);
      });
      return this.read(actor, vendorId);
    },
    async review(actor, vendorId, input) {
      if (input.decision === "changes_requested" && !input.reason?.trim()) throw new ApiError(400, "VENDOR_INDUCTION_REASON_REQUIRED", "Give the vendor a reason for the requested changes.");
      return transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const hash = payloadHash({ submissionId: input.submissionId, decision: input.decision, reason: input.reason?.trim() || null });
        const replay = await VendorInductionReviewModel.findOne({ vendorId, idempotencyKey: input.idempotencyKey }).session(session).lean().exec() as Row | null;
        if (replay) {
          if (replay.actorId !== actor.id || replay.payloadHash !== hash || replay.version - 1 !== (input.expectedReviewVersion ?? 0)) conflict("VENDOR_INDUCTION_IDEMPOTENCY_CONFLICT");
          return detail(vendor, now(), activationForVendor, session);
        }
        const previous = await latestReview(vendorId, session);
        if ((previous?.version ?? null) !== input.expectedReviewVersion) conflict();
        const submission = await VendorInductionSubmissionModel.findOne({ _id: input.submissionId, vendorId }).session(session).lean().exec() as Row | null;
        const request = await latestRequest(vendorId, session);
        if (!submission || !request || request._id !== submission.requestId || request.status !== "consumed" || submission.vendorType !== typeOf(vendor))
          conflict("VENDOR_INDUCTION_SUBMISSION_STALE");
        const currentSubmission = submission!;
        if (previous?.submissionId === currentSubmission._id) conflict("VENDOR_INDUCTION_ALREADY_REVIEWED");
        const timestamp = now();
        const [created] = await VendorInductionReviewModel.create([{ _id: `vendor-induction-review-${randomUUID()}`, vendorId,
          version: (previous?.version ?? 0) + 1, submissionId: String(currentSubmission._id), vendorType: currentSubmission.vendorType,
          decision: input.decision, reason: input.reason?.trim() || null, actorId: actor.id,
          reviewedAt: timestamp, idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: `vendor_induction.${input.decision}`, entityType: "vendor_induction", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { reviewVersion: previous?.version ?? null },
          newValues: { reviewId: String(created!._id), submissionId: String(currentSubmission._id), version: (previous?.version ?? 0) + 1,
            questionnaireVersion: currentSubmission.questionnaireVersion, decision: input.decision } }, session);
        return detail(vendor, timestamp, activationForVendor, session);
      });
    },
    async reopen(actor, vendorId, input) {
      if (!input.reason.trim()) throw new ApiError(400, "VENDOR_INDUCTION_REASON_REQUIRED", "Give a reason for reopening induction.");
      return transaction(async session => {
        await aiEstimatorKnowledgeVendorActorGuard.requireMutationActor(actor, session);
        const vendor = await lockVendor(vendorId, session);
        const hash = payloadHash({ reason: input.reason.trim() });
        const replay = await VendorInductionReviewModel.findOne({ vendorId, idempotencyKey: input.idempotencyKey }).session(session).lean().exec() as Row | null;
        if (replay) {
          if (replay.actorId !== actor.id || replay.payloadHash !== hash || replay.version - 1 !== input.expectedReviewVersion) conflict("VENDOR_INDUCTION_IDEMPOTENCY_CONFLICT");
          return detail(vendor, now(), activationForVendor, session);
        }
        const previous = await latestReview(vendorId, session);
        if (!previous || previous.version !== input.expectedReviewVersion || previous.decision !== "approved") conflict();
        const approvedReview = previous!;
        const timestamp = now();
        const [created] = await VendorInductionReviewModel.create([{ _id: `vendor-induction-review-${randomUUID()}`, vendorId,
          version: approvedReview.version + 1, submissionId: String(approvedReview.submissionId), vendorType: approvedReview.vendorType,
          decision: "reopened", reason: input.reason.trim(), actorId: actor.id,
          reviewedAt: timestamp, idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_induction.reopened", entityType: "vendor_induction", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { reviewId: String(approvedReview._id), version: approvedReview.version },
          newValues: { reviewId: String(created!._id), version: approvedReview.version + 1, reason: input.reason.trim() } }, session);
        return detail(vendor, timestamp, activationForVendor, session);
      });
    },
    async inspect(token) {
      return transaction(async session => {
        const request = await tokenRequest(token, session);
        const foundVendor = await AiEstimatorKnowledgeVendorModel.findById(String(request.vendorId)).session(session).lean().exec() as Row | null;
        if (!foundVendor) unavailable();
        const vendor = foundVendor!;
        if (!validRequest(request, vendor, now()) || (await latestRequest(String(vendor._id), session))?._id !== request._id) unavailable();
        return { vendor: { name: String(vendor.name), vendorType: typeOf(vendor)!, workProfile: text(vendor.procurementProfile?.workProfile),
          representativeName: text(vendor.procurementProfile?.nameOfRepresentative), representativePosition: text(vendor.procurementProfile?.position) },
          questionnaire: { id: String(request.questionnaireId), version: Number(request.questionnaireVersion), vendorType: request.vendorType,
            questions: questionsOf(request), publishedAt: iso(request.questionnairePublishedAt) },
          changeNote: request.changeNote ?? null, expiresAt: iso(request.expiresAt) };
      });
    },
    async submit(input) {
      return transaction(async session => {
        const request = await tokenRequest(input.token, session);
        const answers = validateVendorInductionAnswers(questionsOf(request), input.answers);
        const hash = payloadHash(answers);
        const foundVendor = await AiEstimatorKnowledgeVendorModel.findById(String(request.vendorId)).session(session).lean().exec() as Row | null;
        if (!foundVendor) unavailable();
        const existingVendor = foundVendor!;
        if (request.vendorType !== typeOf(existingVendor) || request.recipientEmailHash !== sha256(emailOf(existingVendor) ?? "")) unavailable();
        if (request.status === "consumed" && request.submissionKey === input.idempotencyKey && request.submissionHash === hash && request.receipt?.submittedAt)
          return { submittedAt: String(request.receipt.submittedAt) };
        const vendor = await lockVendor(String(request.vendorId), session, true);
        if (!validRequest(request, vendor, now()) || (await latestRequest(String(vendor._id), session))?._id !== request._id) unavailable();
        const timestamp = now(); const receipt = { submittedAt: timestamp.toISOString() };
        const consumed = await VendorInductionRequestModel.updateOne({ _id: request._id, status: "sent", tokenHash: request.tokenHash },
          { $set: { status: "consumed", consumedAt: timestamp, submissionKey: input.idempotencyKey, submissionHash: hash, receipt } }, { session });
        if (consumed.modifiedCount !== 1) unavailable();
        const [created] = await VendorInductionSubmissionModel.create([{ _id: `vendor-induction-submission-${randomUUID()}`,
          vendorId: String(vendor._id), requestId: String(request._id), questionnaireVersion: request.questionnaireVersion,
          vendorType: request.vendorType, questionnaire: { id: String(request.questionnaireId), version: Number(request.questionnaireVersion),
            vendorType: request.vendorType, questions: questionsOf(request), publishedAt: iso(request.questionnairePublishedAt) },
          answers, submittedAt: timestamp, idempotencyKey: input.idempotencyKey, payloadHash: hash }], { session });
        await audit.appendInMongoTransaction({ actorId: `vendor:${String(vendor._id)}`, action: "vendor_induction.submitted",
          entityType: "vendor_induction", entityId: String(vendor._id), occurredAt: timestamp.toISOString(),
          newValues: { requestId: String(request._id), submissionId: String(created!._id), questionnaireVersion: request.questionnaireVersion } }, session);
        return receipt;
      });
    }
  };
}

async function tokenRequest(rawToken: string, session: ClientSession): Promise<Row> {
  if (typeof rawToken !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) unavailable();
  const request = await VendorInductionRequestModel.findOne({ tokenHash: sha256(rawToken) }).session(session).lean().exec() as Row | null;
  if (!request) unavailable();
  return request!;
}
