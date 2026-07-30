import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { paginatedEnvelope, paginationShape } from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { LeadService } from "../services/lead.service.js";
import type {
  EstimatePdfInput,
  EstimatePdfService
} from "../services/estimate-pdf.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";
import mongoose from "mongoose";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";

const stages = ["new_lead", "contacted", "site_visit", "design_meeting", "estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"] as const;
const activities = ["call", "whatsapp", "meeting", "email", "note"] as const;
const nullableText = z.string().trim().min(1).nullable().optional();
const leadFields = z.object({ clientName: z.string().trim().min(1), clientEmail: z.string().trim().email(), clientMobile: z.string().trim().min(1), projectName: z.string().trim().min(1), location: z.string().trim().min(1), propertyType: z.string().trim().min(1), budgetMin: z.number().nonnegative().nullable().optional(), budgetMax: z.number().nonnegative().nullable().optional(), source: z.string().trim().min(1), nextAction: z.string().trim().min(1), nextActionAt: z.string().datetime({ offset: true }), builder: nullableText, areaSqft: z.number().positive().nullable().optional(), targetHandoverAt: z.string().datetime({ offset: true }).nullable().optional(), notes: nullableText }).strict();
const budgetValid = (value: { budgetMin?: number | null; budgetMax?: number | null }) => value.budgetMin == null || value.budgetMax == null || value.budgetMax >= value.budgetMin;
const createSchema = leadFields.refine(budgetValid, { path: ["budgetMax"], message: "Maximum budget must be at least the minimum budget." });
const updateSchema = leadFields.partial().extend({ stage: z.enum(stages).optional() }).refine((value) => Object.keys(value).length > 0, { path: ["stage"], message: "Provide at least one lead change." }).refine(budgetValid, { path: ["budgetMax"], message: "Maximum budget must be at least the minimum budget." });
const listSchema = z.object({ ...paginationShape, search: z.string().trim().optional(), stage: z.enum(stages).optional() }).strict();
const activitySchema = z.object({ type: z.enum(activities), note: z.string().trim().min(1), occurredAt: z.string().datetime({ offset: true }) }).strict();
const estimateLineSchema = z.object({ catalogueId: z.string().min(1), roomName: z.string().min(1), specification: z.string().min(1), unit: z.string().min(1), rate: z.number().nonnegative(), quantity: z.number().nonnegative(), included: z.boolean() }).strict();
const estimateSchema = z.object({ propertyType: z.string().min(1), rooms: z.array(z.record(z.unknown())), scopes: z.array(z.string()), lineItems: z.array(estimateLineSchema) }).strict();
const assignmentSchema = z.object({ designerId: z.string().trim().min(1) }).strict();
const decisionSchema = z.object({ decision: z.enum(["approve", "request_changes"]), note: z.string().trim().max(1000).default("") }).strict();
const clientVisibleEstimateStatuses = [
  "sent_to_client",
  "client_changes_requested",
  "client_approved"
] as const;

export function createLeadsRouter(
  auth: AuthService,
  leads: LeadService,
  estimatePdf: EstimatePdfService,
  estimateDesigns: EstimateDesignService
): Router {
  const router = Router(); const protectedRoute = authenticate(auth); const allowed = authorizeRoles("estimator_sales");
  router.get("/leads", protectedRoute, allowed, validateQuery(listSchema), async (req, res, next) => { try { const { limit, offset, search, stage } = res.locals.validatedQuery; const pagination = { limit, offset }; res.json({ data: paginatedEnvelope(await leads.page(req.authenticatedUser!, { search, stage }, pagination), pagination) }); } catch (error) { next(error); } });
  router.post("/leads", protectedRoute, allowed, validateBody(createSchema), async (req, res, next) => { try { res.status(201).json({ data: await leads.create(req.authenticatedUser!, req.body) }); } catch (error) { next(error); } });
  router.get("/leads/:leadId", protectedRoute, allowed, async (req, res, next) => { try { res.json({ data: await leads.get(req.authenticatedUser!, req.params.leadId as string) }); } catch (error) { next(error); } });
  router.patch("/leads/:leadId", protectedRoute, allowed, validateBody(updateSchema), async (req, res, next) => { try { res.json({ data: await leads.update(req.authenticatedUser!, req.params.leadId as string, req.body) }); } catch (error) { next(error); } });
  router.get("/leads/:leadId/activities", protectedRoute, allowed, validateQuery(z.object(paginationShape).strict()), async (req, res, next) => { try { const { limit, offset } = res.locals.validatedQuery; const items = await leads.listActivities(req.authenticatedUser!, req.params.leadId as string); res.json({ data: paginatedEnvelope({ items: items.slice(offset, offset + limit), total: items.length }, { limit, offset }) }); } catch (error) { next(error); } });
  router.post("/leads/:leadId/activities", protectedRoute, allowed, validateBody(activitySchema), async (req, res, next) => { try { res.status(201).json({ data: await leads.addActivity(req.authenticatedUser!, req.params.leadId as string, req.body) }); } catch (error) { next(error); } });
  router.get("/leads/:leadId/estimate", protectedRoute, allowed, async (req, res, next) => { try { const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string); const estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id }).lean(); res.json({ data: estimate ? mapEstimate(estimate) : null }); } catch (error) { next(error); } });
  router.get("/estimates", protectedRoute, allowed, async (req, res, next) => { try {
    const estimates = await EstimateModel.find({ ownerId: req.authenticatedUser!.id }).sort({ updatedAt: -1 }).lean();
    const leadItems = await LeadModel.find({ _id: { $in: estimates.map((estimate) => estimate.leadId) }, ownerId: req.authenticatedUser!.id }).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => {
      const lead = byId.get(estimate.leadId);
      return { ...mapEstimate(estimate), lead: lead ? { ...lead, id: lead._id, _id: undefined } : null };
    }) });
  } catch (error) { next(error); } });
  router.put("/leads/:leadId/estimate", protectedRoute, allowed, validateBody(estimateSchema), async (req, res, next) => { try {
    const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string);
    const lineItems = req.body.lineItems.map((line: z.infer<typeof estimateLineSchema>) => ({ ...line, amount: line.included ? Math.round(line.quantity * line.rate) : 0 }));
    const subtotal = lineItems.reduce((sum: number, line: { amount: number }) => sum + line.amount, 0);
    const gst = Math.round(subtotal * .18);
    let estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id });
    if (estimate && !["draft", "designer_changes_requested", "client_changes_requested"].includes(estimate.status)) {
      throw new ApiError(409, "ESTIMATE_LOCKED", "This estimate is locked while another person is reviewing it.");
    }
    if (!estimate) {
      estimate = new EstimateModel({ _id: `estimate-${randomUUID()}`, leadId: lead.id, ownerId: req.authenticatedUser!.id, version: 1, status: "draft" });
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
  router.post("/leads/:leadId/estimate/submit", protectedRoute, allowed, async (req, res, next) => { try {
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

  router.get("/estimates/:estimateId/pdf", protectedRoute, allowed, async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, ownerId: req.authenticatedUser!.id }).lean();
    if (!estimate) throw estimateNotFound();
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (!lead) throw estimateNotFound();
    const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
  } catch (error) { next(error); } });

  router.get("/estimates/review-queue", protectedRoute, authorizeRoles("design_manager", "designer"), async (req, res, next) => { try {
    const user = req.authenticatedUser!;
    const filter = user.role === "design_manager"
      ? { status: "pending_manager_assignment" }
      : { status: "pending_designer_approval", assignedDesignerId: user.id };
    const estimates = await EstimateModel.find(filter).sort({ submittedAt: 1 }).lean();
    const leadIds = estimates.map((estimate) => estimate.leadId);
    const leadItems = await LeadModel.find({ _id: { $in: leadIds } }).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => ({ ...mapEstimate(estimate), lead: byId.get(estimate.leadId) ?? null })) });
  } catch (error) { next(error); } });

  router.get("/estimates/designers", protectedRoute, authorizeRoles("design_manager"), async (req, res, next) => { try {
    const designers = await UserModel.find({ role: "designer", managerId: req.authenticatedUser!.id, active: true }).select("_id name email title").lean();
    res.json({ data: designers.map((designer) => ({ id: designer._id, name: designer.name, email: designer.email, title: designer.title ?? null })) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/assign", protectedRoute, authorizeRoles("design_manager"), validateBody(assignmentSchema), async (req, res, next) => { try {
    const designer = await UserModel.findOne({ _id: req.body.designerId, role: "designer", managerId: req.authenticatedUser!.id, active: true }).lean();
    if (!designer) throw new ApiError(404, "DESIGNER_NOT_FOUND", "Choose an active designer from your team.");
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: "pending_manager_assignment" });
    if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_ASSIGNABLE", "This estimate is no longer awaiting assignment.");
    estimate.assignedManagerId = req.authenticatedUser!.id;
    estimate.assignedDesignerId = designer._id;
    estimate.status = "pending_designer_approval";
    estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: "designer_assigned", note: designer.name, occurredAt: new Date() });
    estimate.notifications.push({ recipientEmail: designer.email, recipientRole: "designer", event: "estimate_approval_assigned", status: "queued", queuedAt: new Date() });
    await estimate.save();
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/designer-decision", protectedRoute, authorizeRoles("designer"), validateBody(decisionSchema), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: "pending_designer_approval", assignedDesignerId: req.authenticatedUser!.id });
    if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This estimate is not assigned to you for review.");
    estimate.status = req.body.decision === "approve" ? "ready_for_client" : "designer_changes_requested";
    estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: req.body.decision === "approve" ? "designer_approved" : "designer_changes_requested", note: req.body.note, occurredAt: new Date() });
    await estimate.save();
    res.json({ data: mapEstimate(estimate.toObject()) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/send-client", protectedRoute, allowed, async (req, res, next) => { try {
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

  router.get("/client/estimates", protectedRoute, authorizeRoles("client"), async (req, res, next) => { try {
    const leadsForClient = await LeadModel.find({ clientEmail: { $regex: `^${escapeRegex(req.authenticatedUser!.email)}$`, $options: "i" } }).lean();
    const estimates = await EstimateModel.find({ leadId: { $in: leadsForClient.map((lead) => lead._id) }, status: { $in: ["sent_to_client", "client_changes_requested", "client_approved"] } }).lean();
    const byId = new Map(leadsForClient.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => ({ ...mapEstimate(estimate), lead: byId.get(estimate.leadId) ?? null })) });
  } catch (error) { next(error); } });

  router.get("/client/estimates/:estimateId/pdf", protectedRoute, authorizeRoles("client"), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: { $in: clientVisibleEstimateStatuses } }).lean();
    if (!estimate) throw estimateNotFound();
    const lead = await LeadModel.findOne({ _id: estimate.leadId, clientEmail: { $regex: `^${escapeRegex(req.authenticatedUser!.email)}$`, $options: "i" } }).lean();
    if (!lead) throw estimateNotFound();
    const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
  } catch (error) { next(error); } });

  router.post("/client/estimates/:estimateId/decision", protectedRoute, authorizeRoles("client"), validateBody(decisionSchema), async (req, res, next) => { try {
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
      const plannedEndAt = new Date(occurredAt);
      plannedEndAt.setDate(plannedEndAt.getDate() + 90);
      const projectId = `project-${randomUUID()}`;
      await ProjectModel.create([{
        _id: projectId,
        name: lead.projectName,
        clientId: req.authenticatedUser!.id,
        clientName: lead.clientName,
        clientEmail: lead.clientEmail,
        clientEmailNormalized: normalizeEmail(lead.clientEmail),
        clientMobile: lead.clientMobile,
        clientAddress: lead.location,
        initiatingDesignerId: assigned._id,
        assignedDesignerIds: [assigned._id],
        managerId: manager._id,
        status: "planning",
        location: lead.location,
        plannedStartAt: occurredAt,
        plannedEndAt
      }], { session });
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
