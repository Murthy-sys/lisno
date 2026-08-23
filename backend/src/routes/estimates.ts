import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";

import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";
import type {
  EstimatePdfInput,
  EstimatePdfService
} from "../services/estimate-pdf.service.js";
import type { LeadService } from "../services/lead.service.js";
import { resolveApprovalProject } from "../services/estimate-project-handoff.js";

const estimateLineSchema = z.object({ catalogueId: z.string().min(1), roomName: z.string().min(1), specification: z.string().min(1), unit: z.string().min(1), rate: z.number().nonnegative(), quantity: z.number().nonnegative(), included: z.boolean() }).strict();
const estimateSchema = z.object({ propertyType: z.string().min(1), rooms: z.array(z.record(z.unknown())), scopes: z.array(z.string()), lineItems: z.array(estimateLineSchema) }).strict();
const assignmentSchema = z.object({ designerId: z.string().trim().min(1) }).strict();
const decisionSchema = z.object({ decision: z.enum(["approve", "request_changes"]), note: z.string().trim().max(1000).default("") }).strict();
const clientVisibleEstimateStatuses = [
  "sent_to_client",
  "client_changes_requested",
  "client_approved"
] as const;

export function createEstimatesRouter(
  auth: AuthService,
  leads: LeadService,
  estimatePdf: EstimatePdfService,
  estimateDesigns: EstimateDesignService,
  audit: AuditService
): Router {
  const router = Router(); const protectedRoute = authenticate(auth);
  router.get("/leads/:leadId/estimate", protectedRoute, requireOperation("GET /leads/:leadId/estimate"), async (req, res, next) => { try { const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string); const estimateFilter = req.authenticatedUser!.role === "super_admin" ? { leadId: lead.id } : { leadId: lead.id, ownerId: req.authenticatedUser!.id }; const estimate = await EstimateModel.findOne(estimateFilter).lean(); res.json({ data: estimate ? mapEstimate(estimate) : null }); } catch (error) { next(error); } });
  router.get("/estimates", protectedRoute, requireOperation("GET /estimates"), async (req, res, next) => { try {
    const estimateFilter = req.authenticatedUser!.role === "super_admin" ? {} : { ownerId: req.authenticatedUser!.id };
    const estimates = await EstimateModel.find(estimateFilter).sort({ updatedAt: -1 }).lean();
    const leadFilter = req.authenticatedUser!.role === "super_admin"
      ? { _id: { $in: estimates.map((estimate) => estimate.leadId) } }
      : { _id: { $in: estimates.map((estimate) => estimate.leadId) }, ownerId: req.authenticatedUser!.id };
    const leadItems = await LeadModel.find(leadFilter).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => {
      const lead = byId.get(estimate.leadId);
      return { ...mapEstimate(estimate), lead: lead ? { ...lead, id: lead._id, _id: undefined } : null };
    }) });
  } catch (error) { next(error); } });
  router.put("/leads/:leadId/estimate", protectedRoute, requireOperation("PUT /leads/:leadId/estimate"), validateBody(estimateSchema), async (req, res, next) => { try {
    const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string);
    const lineItems = req.body.lineItems.map((line: z.infer<typeof estimateLineSchema>) => ({ ...line, amount: line.included ? Math.round(line.quantity * line.rate) : 0 }));
    const subtotal = lineItems.reduce((sum: number, line: { amount: number }) => sum + line.amount, 0);
    const gst = Math.round(subtotal * .18);
    let estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id });
    const leadProjectId = lead.projectId ?? null;
    const estimateProjectId = estimate?.projectId ?? null;
    if (
      leadProjectId !== null &&
      estimateProjectId !== null &&
      leadProjectId !== estimateProjectId
    ) {
      throw new ApiError(
        409,
        "ESTIMATE_PROJECT_CONFLICT",
        "The estimate and lead are linked to different projects."
      );
    }
    if (estimate && !["draft", "designer_changes_requested", "client_changes_requested"].includes(estimate.status)) {
      throw new ApiError(409, "ESTIMATE_LOCKED", "This estimate is locked while another person is reviewing it.");
    }
    if (!estimate) {
      estimate = new EstimateModel({ _id: `estimate-${randomUUID()}`, leadId: lead.id, ownerId: req.authenticatedUser!.id, projectId: leadProjectId, version: 1, status: "draft" });
    } else if (estimate.projectId == null && leadProjectId !== null) {
      estimate.projectId = leadProjectId;
    }
    estimate.propertyType = req.body.propertyType;
    estimate.rooms = req.body.rooms;
    estimate.scopes = req.body.scopes;
    estimate.lineItems = lineItems;
    estimate.subtotal = subtotal;
    estimate.gst = gst;
    estimate.total = subtotal + gst;
    if (estimate.status !== "draft") {
      estimate.status = "draft";
      estimate.version += 1;
    }
    await estimate.save();
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });
  router.post("/leads/:leadId/estimate/submit", protectedRoute, requireOperation("POST /leads/:leadId/estimate/submit"), async (req, res, next) => { try {
    const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string);
    const estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id });
    if (!estimate || estimate.lineItems.every((line: { included: boolean }) => !line.included)) throw new ApiError(409, "ESTIMATE_EMPTY", "Select at least one estimate item before submitting.");
    const approvalRequired = estimate.total > 1_500_000;
    estimate.approvalRequired = approvalRequired;
    estimate.status = approvalRequired ? "pending_manager_assignment" : "sent_to_client";
    estimate.submittedAt = new Date();
    if (!approvalRequired) {
      estimate.sentToClientAt = new Date();
      estimate.notifications.push({ recipientEmail: lead.clientEmail, recipientRole: "client", event: "estimate_ready_for_review", status: "queued", queuedAt: new Date() });
      await LeadModel.updateOne({ _id: lead.id }, { $set: { stage: "estimate_sent", nextAction: "client estimate decision", nextActionAt: new Date() } });
    }
    estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: "submitted", note: "", occurredAt: new Date() });
    await estimate.save();
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });

  router.get("/estimates/:estimateId/pdf", protectedRoute, requireOperation("GET /estimates/:estimateId/pdf"), async (req, res, next) => { try {
    const filter = req.authenticatedUser!.role === "super_admin"
      ? { _id: req.params.estimateId }
      : { _id: req.params.estimateId, ownerId: req.authenticatedUser!.id };
    const estimate = await EstimateModel.findOne(filter).lean();
    if (!estimate) throw estimateNotFound();
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (!lead) throw estimateNotFound();
    const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
  } catch (error) { next(error); } });

  router.get("/estimates/review-queue", protectedRoute, requireOperation("GET /estimates/review-queue"), async (req, res, next) => { try {
    const user = req.authenticatedUser!;
    const filter = user.role === "super_admin"
      ? { status: { $in: ["pending_manager_assignment", "pending_designer_approval"] } }
      : user.role === "design_manager"
      ? { status: "pending_manager_assignment" }
      : { status: "pending_designer_approval", assignedDesignerId: user.id };
    const estimates = await EstimateModel.find(filter).sort({ submittedAt: 1 }).lean();
    const leadIds = estimates.map((estimate) => estimate.leadId);
    const leadItems = await LeadModel.find({ _id: { $in: leadIds } }).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => ({ ...mapEstimate(estimate), lead: byId.get(estimate.leadId) ?? null })) });
  } catch (error) { next(error); } });

  router.get("/estimates/designers", protectedRoute, requireOperation("GET /estimates/designers"), async (req, res, next) => { try {
    const filter = req.authenticatedUser!.role === "super_admin"
      ? { role: "designer", active: true }
      : { role: "designer", managerId: req.authenticatedUser!.id, active: true };
    const designers = await UserModel.find(filter).select("_id name email title").lean();
    res.json({ data: designers.map((designer) => ({ id: designer._id, name: designer.name, email: designer.email, title: designer.title ?? null })) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/assign", protectedRoute, requireOperation("POST /estimates/:estimateId/assign"), validateBody(assignmentSchema), async (req, res, next) => { try {
    let responseEstimate: Record<string, unknown> | null = null;
    await withMongoTransaction(async (session) => {
      const designerFilter = req.authenticatedUser!.role === "super_admin"
        ? { _id: req.body.designerId, role: "designer", active: true }
        : { _id: req.body.designerId, role: "designer", managerId: req.authenticatedUser!.id, active: true };
      const designer = await UserModel.findOne(designerFilter).session(session).lean();
      if (!designer) throw new ApiError(404, "DESIGNER_NOT_FOUND", "Choose an active designer from your team.");
      const manager = designer.managerId
        ? await UserModel.findOne({ _id: designer.managerId, role: "design_manager", active: true }).session(session).lean()
        : null;
      if (!manager) throw new ApiError(404, "DESIGNER_MANAGER_NOT_FOUND", "Choose a designer with an active accountable manager.");
      const estimate = await EstimateModel.findOne({
        _id: req.params.estimateId,
        status: "pending_manager_assignment"
      }).session(session);
      if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_ASSIGNABLE", "This estimate is no longer awaiting assignment.");
      const occurredAt = new Date();
      estimate.assignedManagerId = manager._id;
      estimate.assignedDesignerId = designer._id;
      estimate.status = "pending_designer_approval";
      estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: "designer_assigned", note: designer.name, occurredAt });
      estimate.notifications.push({ recipientEmail: designer.email, recipientRole: "designer", event: "estimate_approval_assigned", status: "queued", queuedAt: occurredAt });
      await estimate.save({ session });
      await audit.appendInMongoTransaction({
        actorId: req.authenticatedUser!.id,
        action: "estimate_designer_assigned",
        entityType: "estimate",
        entityId: String(estimate._id),
        occurredAt: occurredAt.toISOString(),
        oldValues: { status: "pending_manager_assignment" },
        newValues: { status: "pending_designer_approval", designerId: String(designer._id), managerId: String(manager._id) }
      }, session);
      responseEstimate = estimate.toObject();
    });
    if (!responseEstimate) throw new Error("Estimate assignment transaction did not complete.");
    res.json({ data: mapEstimate(responseEstimate) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/designer-decision", protectedRoute, requireOperation("POST /estimates/:estimateId/designer-decision"), validateBody(decisionSchema), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: "pending_designer_approval", assignedDesignerId: req.authenticatedUser!.id });
    if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This estimate is not assigned to you for review.");
    estimate.status = req.body.decision === "approve" ? "ready_for_client" : "designer_changes_requested";
    estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: req.body.decision === "approve" ? "designer_approved" : "designer_changes_requested", note: req.body.note, occurredAt: new Date() });
    await estimate.save();
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/send-client", protectedRoute, requireOperation("POST /estimates/:estimateId/send-client"), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, ownerId: req.authenticatedUser!.id, status: "ready_for_client" });
    if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_READY", "Complete required approvals before sending this estimate.");
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (!lead) throw new ApiError(404, "LEAD_NOT_FOUND", "Lead not found.");
    estimate.status = "sent_to_client";
    estimate.sentToClientAt = new Date();
    estimate.notifications.push({ recipientEmail: lead.clientEmail, recipientRole: "client", event: "estimate_ready_for_review", status: "queued", queuedAt: new Date() });
    await estimate.save();
    await LeadModel.updateOne({ _id: lead._id }, { $set: { stage: "estimate_sent", nextAction: "client estimate decision", nextActionAt: new Date() } });
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });

  router.get("/client/estimates", protectedRoute, requireOperation("GET /client/estimates"), async (req, res, next) => { try {
    const globalReader = req.authenticatedUser!.role === "super_admin";
    const estimates = globalReader
      ? await EstimateModel.find({ status: { $in: clientVisibleEstimateStatuses } }).lean()
      : [];
    const leadsForClient = globalReader
      ? await LeadModel.find({ _id: { $in: estimates.map((estimate) => estimate.leadId) } }).lean()
      : await LeadModel.find({ clientEmail: { $regex: `^${escapeRegex(req.authenticatedUser!.email)}$`, $options: "i" } }).lean();
    const visibleEstimates = globalReader
      ? estimates
      : await EstimateModel.find({ leadId: { $in: leadsForClient.map((lead) => lead._id) }, status: { $in: clientVisibleEstimateStatuses } }).lean();
    const byId = new Map(leadsForClient.map((lead) => [lead._id, lead]));
    res.json({ data: visibleEstimates.map((estimate) => ({ ...mapEstimate(estimate), lead: byId.get(estimate.leadId) ?? null })) });
  } catch (error) { next(error); } });

  router.get("/client/estimates/:estimateId/pdf", protectedRoute, requireOperation("GET /client/estimates/:estimateId/pdf"), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: { $in: clientVisibleEstimateStatuses } }).lean();
    if (!estimate) throw estimateNotFound();
    const leadFilter = req.authenticatedUser!.role === "super_admin"
      ? { _id: estimate.leadId }
      : { _id: estimate.leadId, clientEmail: { $regex: `^${escapeRegex(req.authenticatedUser!.email)}$`, $options: "i" } };
    const lead = await LeadModel.findOne(leadFilter).lean();
    if (!lead) throw estimateNotFound();
    const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
  } catch (error) { next(error); } });

  router.post("/client/estimates/:estimateId/decision", protectedRoute, requireOperation("POST /client/estimates/:estimateId/decision"), validateBody(decisionSchema), async (req, res, next) => { try {
    let responseEstimate: Record<string, any> | null = null;
    await withMongoTransaction(async (session) => {
      const estimate = await EstimateModel.findOne({
        _id: req.params.estimateId
      }).session(session).lean();
      if (!estimate) throw estimateNotFound();
      const lead = await LeadModel.findById(estimate.leadId).session(session).lean();
      if (
        !lead ||
        normalizeEmail(lead.clientEmail) !==
          normalizeEmail(req.authenticatedUser!.email)
      ) {
        throw estimateNotFound();
      }
      if (estimate.status !== "sent_to_client") {
        throw new ApiError(
          409,
          "ESTIMATE_NOT_REVIEWABLE",
          "This estimate is no longer awaiting your review."
        );
      }
      const occurredAt = new Date();
      const review = {
        actorId: req.authenticatedUser!.id,
        action: req.body.decision === "approve"
          ? "client_approved"
          : "client_changes_requested",
        note: req.body.note,
        occurredAt
      };
      if (req.body.decision === "request_changes") {
        const updated = await EstimateModel.updateOne(
          {
            _id: estimate._id,
            status: "sent_to_client",
            version: estimate.version,
            designLifecycleVersion: lifecycleVersionFilter(
              Number(estimate.designLifecycleVersion ?? 0)
            ),
            designFrozenAt: { $in: [null] }
          },
          {
            $set: {
              status: "client_changes_requested",
              clientDecisionAt: occurredAt
            },
            $inc: { version: 1, designLifecycleVersion: 1 },
            $push: { reviews: review }
          },
          { session }
        );
        requireMatchedEstimate(updated);
        await audit.appendInMongoTransaction({
          actorId: req.authenticatedUser!.id,
          action: "estimate_design_final_changes_requested",
          entityType: "estimate",
          entityId: String(estimate._id),
          occurredAt: occurredAt.toISOString(),
          oldValues: { status: "sent_to_client" },
          newValues: {
            status: "client_changes_requested",
            noteLength: req.body.note.length
          }
        }, session);
        responseEstimate = {
          ...estimate,
          status: "client_changes_requested",
          version: Number(estimate.version) + 1,
          designLifecycleVersion:
            Number(estimate.designLifecycleVersion ?? 0) + 1,
          clientDecisionAt: occurredAt,
          reviews: [...(estimate.reviews ?? []), review]
        };
        return;
      }
      const readiness = await estimateDesigns.approvalReadiness(
        req.authenticatedUser!,
        String(estimate._id),
        session
      );
      if (!readiness.ready) {
        throw new ApiError(
          409,
          "ESTIMATE_DRAWINGS_UNRESOLVED",
          "Every submitted drawing must be approved before approving the estimate."
        );
      }
      const assigned = estimate.assignedDesignerId
        ? await UserModel.findById(estimate.assignedDesignerId).session(session).lean()
        : await UserModel.findOne({ role: "designer", active: true })
            .sort({ createdAt: 1 })
            .session(session)
            .lean();
      const manager = assigned?.managerId
        ? await UserModel.findById(assigned.managerId).session(session).lean()
        : await UserModel.findOne({ role: "design_manager", active: true })
            .sort({ createdAt: 1 })
            .session(session)
            .lean();
      if (!assigned || !manager) {
        throw new ApiError(
          409,
          "PROJECT_TEAM_REQUIRED",
          "A design manager must configure an active project team."
        );
      }
      const projectId = await resolveApprovalProject({
        estimate: {
          projectId: estimate.projectId == null ? null : String(estimate.projectId),
          ownerId: String(estimate.ownerId)
        },
        lead: {
          projectId: lead.projectId == null ? null : String(lead.projectId),
          ownerId: String(lead.ownerId),
          projectName: lead.projectName,
          clientName: lead.clientName,
          clientEmail: lead.clientEmail,
          clientMobile: lead.clientMobile,
          location: lead.location
        },
        clientId: req.authenticatedUser!.id,
        assignedDesignerId: String(assigned._id),
        managerId: String(manager._id),
        occurredAt,
        session
      });
      const recipients = [assigned, manager].map((user) => ({
        recipientEmail: user.email,
        recipientRole: user.role,
        event: "project_kickoff_created",
        status: "queued" as const,
        queuedAt: occurredAt
      }));
      const updated = await EstimateModel.updateOne(
        {
          _id: estimate._id,
          status: "sent_to_client",
          version: estimate.version,
          designLifecycleVersion: lifecycleVersionFilter(
            Number(estimate.designLifecycleVersion ?? 0)
          ),
          designFrozenAt: { $in: [null] }
        },
        {
          $set: {
            status: "client_approved",
            projectId,
            clientDecisionAt: occurredAt,
            designFrozenAt: occurredAt
          },
          $inc: { version: 1, designLifecycleVersion: 1 },
          $push: {
            reviews: review,
            notifications: { $each: recipients }
          }
        },
        { session }
      );
      requireMatchedEstimate(updated);
      const leadUpdated = await LeadModel.updateOne(
        { _id: lead._id, clientEmail: lead.clientEmail },
        {
          $set: {
            stage: "won",
            nextAction: "project kickoff",
            nextActionAt: occurredAt
          }
        },
        { session }
      );
      if (leadUpdated.matchedCount !== 1) throw estimateNotFound();
      await audit.appendInMongoTransaction({
        actorId: req.authenticatedUser!.id,
        action: "estimate_design_final_approved",
        entityType: "estimate",
        entityId: String(estimate._id),
        occurredAt: occurredAt.toISOString(),
        oldValues: { status: "sent_to_client" },
        newValues: {
          status: "client_approved",
          projectId,
          approvedDrawingCount: readiness.approved
        }
      }, session);
      responseEstimate = {
        ...estimate,
        status: "client_approved",
        version: Number(estimate.version) + 1,
        designLifecycleVersion:
          Number(estimate.designLifecycleVersion ?? 0) + 1,
        designFrozenAt: occurredAt,
        projectId,
        clientDecisionAt: occurredAt,
        reviews: [...(estimate.reviews ?? []), review],
        notifications: [...(estimate.notifications ?? []), ...recipients]
      };
    });
    if (!responseEstimate) throw new Error("Estimate decision transaction did not complete.");
    res.json({ data: mapEstimate(responseEstimate) });
  } catch (error) { next(error); } });
  return router;
}

function mapEstimate(value: Record<string, unknown> | null) { if (!value) return null; return { ...value, id: value._id, _id: undefined }; }
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function estimateNotFound() { return new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found."); }
function requireMatchedEstimate(result: { matchedCount: number }) {
  if (result.matchedCount !== 1) {
    throw new ApiError(
      409,
      "ESTIMATE_NOT_REVIEWABLE",
      "This estimate is no longer awaiting your review."
    );
  }
}
function lifecycleVersionFilter(version: number) {
  return version === 0 ? { $in: [0, null] } : version;
}
async function withMongoTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
) {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
function toEstimatePdfInput(
  estimate: {
    _id: string;
    version: number;
    status: string;
    propertyType: string;
    subtotal: number;
    gst: number;
    total: number;
    lineItems: EstimatePdfInput["lineItems"];
  },
  lead: {
    clientName: string;
    clientEmail: string;
    projectName: string;
    location: string;
  }
): EstimatePdfInput {
  return {
    id: estimate._id,
    version: estimate.version,
    status: estimate.status,
    propertyType: estimate.propertyType,
    subtotal: estimate.subtotal,
    gst: estimate.gst,
    total: estimate.total,
    lineItems: estimate.lineItems,
    lead: {
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      projectName: lead.projectName,
      location: lead.location
    }
  };
}
