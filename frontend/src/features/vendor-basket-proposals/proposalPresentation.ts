import { ApiError } from "../../api/client";
import type { KnowledgeSectionKey } from "../ai-estimator-knowledge/knowledgeTypes";
import type { ProposalChange, ProposalHierarchyNode, ProposalResource, ProposalRequestMode, ProposalStatus } from "./proposalTypes";

export const proposalStatusLabels: Record<ProposalStatus, string> = { draft: "Draft", pending: "Awaiting Super Admin", fulfilled: "Approved and active", rejected: "Rejected" };
export const proposalStatusLabel = (status: ProposalStatus, mode?: ProposalRequestMode) => mode === "hierarchy_intake" && status === "fulfilled" ? "Approved" : mode === "hierarchy_intake" && status === "rejected" ? "Sent back" : proposalStatusLabels[status];
export const proposalDenied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404);
export const proposalUncertain = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status === 408;
export const proposalError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed. Your entries are preserved.";

const sectionLabels: Record<KnowledgeSectionKey, string> = {
  design: "Design", overview: "Overview", advanced: "Mode settings", pricing: "Mode pricing",
  recommendations: "Recommendations", quality: "Quality parameters", scope: "Scope",
  "quantity-margin": "Quantity and margin", execution: "Execution"
};
const metadataLabels: Record<string, string> = { name: "name", description: "description", displayOrder: "display order", decimalScale: "quantity decimal places" };
function payload(resource: ProposalResource | null) {
  return resource?.payload && typeof resource.payload === "object" && !Array.isArray(resource.payload) ? resource.payload as Record<string, unknown> : {};
}
function resourceName(resource: ProposalResource | null) {
  const name = payload(resource).name;
  return typeof name === "string" && name.trim() ? name : null;
}

export function proposalChangeSummaries(changes: readonly ProposalChange[], nodes: readonly ProposalHierarchyNode[], basketName: string) {
  const lineNames = new Map(nodes.filter(node => node.kind === "main_line").map(node => [node.resourceId, node.payload.name]));
  for (const change of changes) {
    if (change.kind !== "main_line") continue;
    const name = resourceName(change.after) ?? resourceName(change.before);
    if (name) lineNames.set(change.resourceId, name);
  }
  return changes.map(change => {
    const resource = change.after ?? change.before;
    const action = change.change === "changed" ? "updated" : change.change;
    let subject: string;
    let category: string;
    if (change.kind === "section") {
      subject = (resource?.parentId && lineNames.get(resource.parentId)) || "Main Line name unavailable";
      const key = payload(change.after).sectionKey ?? payload(change.before).sectionKey;
      category = typeof key === "string" && Object.hasOwn(sectionLabels, key) ? sectionLabels[key as KnowledgeSectionKey] : "Configuration";
    } else if (change.kind === "quality") {
      subject = basketName;
      category = "Shared basket quality";
    } else {
      category = change.kind === "uom" ? "Proposed UOM" : change.kind === "surface" ? "Proposed Surface" : change.kind === "basket" ? "Main Basket" : change.kind === "sub_basket" ? "Sub-Basket" : "Main Line";
      subject = resourceName(change.after) ?? resourceName(change.before) ?? `${category} name unavailable`;
    }
    const fields = change.kind !== "section" && change.kind !== "quality" && change.change === "changed"
      ? change.fields.flatMap(field => Object.hasOwn(metadataLabels, field) ? [metadataLabels[field]] : []) : [];
    return { resourceId: change.resourceId, title: `${subject} · ${category} ${action}`, description: fields.length ? `Changed: ${fields.join(", ")}.` : null, savedAt: change.after?.savedAt ?? null };
  });
}
