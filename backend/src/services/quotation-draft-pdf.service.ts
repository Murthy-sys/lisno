import { effectiveCommercialStatus, estimateWorkingCopyEditable } from "../domain/estimation-lifecycle.js";
import { createEstimateProposal } from "../domain/estimate-proposal.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { requireEstimateStaffActor } from "./estimate-collaboration-policy.service.js";
import { estimateStaffReadFilter } from "./estimate-staff-read-scope.js";
import { LeadModel } from "../models/Lead.js";
import type { PublicUser } from "./auth.service.js";
import { createClientQuotationProjectionService } from "./client-quotation-projection.service.js";
import { presentEstimateInHouseResponse } from "./estimate-in-house-presentation.js";
import type { EstimatePdfService } from "./estimate-pdf.service.js";
import { assertCurrentConfiguredPublication, assertPublishableConfiguredLines, toEstimateSnapshot, type PublicationEstimate } from "./estimate-publication.service.js";
import { visibleQuotationSources } from "./quotation-setup.service.js";
import { estimateTierScope } from "./estimate-tiers.service.js";

export async function readSavedQuotationPdf(actor: PublicUser, projectId: string | null, estimateId: string, expectedVersion: number,
  pdf: EstimatePdfService, stage: "draft" | "internal-review" = "draft") {
  const currentEstimate = async () => {
    let estimate: PublicationEstimate;
    if (projectId !== null) {
      const context = await estimateTierScope(actor, projectId);
      if (context.project.estimationWorkflowVersion !== 3 || context.estimate?.estimation?.workflowVersion !== 3 ||
        context.estimate._id !== estimateId) throw new ApiError(404, "QUOTATION_NOT_FOUND", "Quotation unavailable.");
      estimate = context.estimate as PublicationEstimate;
    } else {
      const staffEstimate = await EstimateModel.findOne({ _id: estimateId, ...estimateStaffReadFilter(actor) }).lean();
      if (!staffEstimate) throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate unavailable.");
      await requireEstimateStaffActor(actor.id, staffEstimate, undefined, actor.role);
      estimate = staffEstimate as unknown as PublicationEstimate;
    }
    const stageMatches = stage === "draft" ? estimateWorkingCopyEditable(estimate) : projectId === null &&
      estimate.estimation?.workflowVersion !== 3 && ["pending_manager_assignment", "pending_designer_approval", "ready_for_client"].includes(effectiveCommercialStatus(estimate));
    if (estimate.version !== expectedVersion || !stageMatches) {
      throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The saved quotation has changed. Refresh it before viewing its PDF.");
    }
    return estimate;
  };
  const estimate = await currentEstimate();
  const lead = await LeadModel.findOne({ _id: estimate.leadId, projectId: estimate.projectId ?? null, ownerId: estimate.ownerId }).lean();
  if (!lead) throw new ApiError(404, "QUOTATION_NOT_FOUND", "Quotation unavailable.");
  if (!estimate.lineItems.some(line => line.included)) {
    throw new ApiError(409, "ESTIMATE_INCOMPLETE", "Save a priced item before viewing the draft quotation PDF.");
  }
  assertPublishableConfiguredLines(estimate);
  const hasPmc = estimate.lineItems.some(line => line.included && line.pricingMode === "pmc");
  if (hasPmc) await assertCurrentConfiguredPublication({ ...estimate, lineItems: estimate.lineItems.filter(line => line.included && line.pricingMode === "pmc") });
  const proposal = createEstimateProposal({ issuedAt: new Date(), projectNumber: lead.projectNumber, estimateId });
  const source = toEstimateSnapshot(estimate, lead, proposal);
  // The version-3 working editor exposes only configured rows from currently selected baskets.
  const isWorkingQuotation = estimate.estimation?.workflowVersion === 3;
  if (isWorkingQuotation) source.lineItems = source.lineItems.map(line =>
    line.source === "configuration" ? line : { ...line, clientVisible: false });
  const projection = createClientQuotationProjectionService(isWorkingQuotation ? {
    resolve: (ids, session) => visibleQuotationSources(estimate, session, false, ids)
  } : {});
  const visible = await projection.project(source);
  const snapshot = await presentEstimateInHouseResponse(visible.snapshot);
  const generated = await pdf.generate({ ...snapshot, id: estimateId, version: expectedVersion, status: stage === "draft" ? "draft" : "internal_review",
    lineItems: [...snapshot.lineItems], includedPayablesPaise: visible.includedPayablesPaise,
    lead: { clientName: snapshot.clientName, clientEmail: lead.clientEmail, projectName: snapshot.projectName, location: snapshot.location }
  }, { profile: "compact_client_delivery" });

  // Rendering can outlive a save, a membership change or a visibility edit.
  const latest = await currentEstimate();
  if (hasPmc) {
    assertPublishableConfiguredLines(latest);
    await assertCurrentConfiguredPublication({ ...latest, lineItems: latest.lineItems.filter(line => line.included && line.pricingMode === "pmc") });
  }
  if (effectiveCommercialStatus(latest) !== effectiveCommercialStatus(estimate)) {
    throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The quotation review stage changed. Refresh before viewing its PDF.");
  }
  if ((await projection.project(source)).visibilityDigest !== visible.visibilityDigest) {
    throw new ApiError(409, "QUOTATION_VISIBILITY_CHANGED", "Quotation visibility changed. Refresh before viewing its PDF.");
  }
  return { ...generated, filename: `quotation-${stage}-v${expectedVersion}.pdf`, mimeType: "application/pdf" as const };
}
