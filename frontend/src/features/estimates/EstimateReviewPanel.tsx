import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import {
  assignEstimateDesigner,
  decideEstimateAsClient,
  decideEstimateAsDesigner,
  estimateWorkflowKeys,
  type EstimateQueueItem,
  getClientEstimates,
  getEstimateDesigners,
  getEstimateReviewQueue
} from "./estimateWorkflowApi";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const catalogue = new Map<string, { description: string; sectionId: string; sectionLabel: string; icon: string }>();
for (const section of estimateBuilderSections) {
  for (const row of section.rows) {
    catalogue.set(row.id, {
      description: row.description,
      sectionId: section.id,
      sectionLabel: section.label,
      icon: section.icon
    });
  }
}

export function EstimateReviewPanel() {
  const role = useAuth().user!.role;
  const queryClient = useQueryClient();
  const [designerByEstimate, setDesignerByEstimate] = useState<Record<string, string>>({});
  const [noteByEstimate, setNoteByEstimate] = useState<Record<string, string>>({});
  const queue = useQuery({
    queryKey: role === "client" ? estimateWorkflowKeys.client : estimateWorkflowKeys.reviewQueue,
    queryFn: role === "client" ? getClientEstimates : getEstimateReviewQueue
  });
  const designers = useQuery({
    queryKey: estimateWorkflowKeys.designers,
    queryFn: getEstimateDesigners,
    enabled: role === "design_manager"
  });
  const action = useMutation({
    mutationFn: async (input: { id: string; action: "assign" | "approve" | "changes" }) => {
      if (input.action === "assign") {
        return assignEstimateDesigner(input.id, designerByEstimate[input.id] ?? "");
      }
      const decision = input.action === "approve" ? "approve" : "request_changes";
      const note = noteByEstimate[input.id] ?? "";
      return role === "client"
        ? decideEstimateAsClient(input.id, decision, note)
        : decideEstimateAsDesigner(input.id, decision, note);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: role === "client" ? estimateWorkflowKeys.client : estimateWorkflowKeys.reviewQueue
      });
    }
  });

  if (queue.isPending) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p>Loading estimate queue…</p></section>;
  if (queue.isError) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p role="alert">Estimate queue is temporarily unavailable.</p></section>;
  if (!queue.data.length) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p className="inline-empty">Nothing needs your action right now.</p></section>;
  const actionableCount = queue.data.filter((estimate) => canActOnEstimate(role, estimate.status)).length;

  return <section className="estimate-review-panel" aria-labelledby="estimate-review-title">
    <header><div><p className="eyebrow">Commercial workflow</p><h2 id="estimate-review-title">{role === "client" ? "Estimates ready for you" : "Estimate approvals"}</h2></div><strong>{actionableCount} awaiting action</strong></header>
    <div className="estimate-review-grid">{queue.data.map((estimate) => {
      const actionable = canActOnEstimate(role, estimate.status);
      return <article className="estimate-review-card" key={estimate.id}>
      <div><p className="eyebrow">{estimate.lead?.location}</p><h3>{estimate.lead?.projectName}</h3><p>{estimate.lead?.clientName}</p></div>
      <strong className="estimate-review-card__total">{money(estimate.total)}</strong>
      <p>{estimate.lineItems.filter((item) => item.included).length} items · GST included</p>
      {role === "client" ? <ClientEstimateDetails estimate={estimate} /> : null}
      {!actionable && role === "client" ? <p className="estimate-notice">{estimate.status === "client_approved" ? "Estimate approved" : "Changes requested"}</p> : null}
      {actionable && (role === "design_manager" ? <label>Assign approval to<select value={designerByEstimate[estimate.id] ?? ""} onChange={(event) => setDesignerByEstimate((current) => ({ ...current, [estimate.id]: event.target.value }))}><option value="">Choose designer</option>{(designers.data ?? []).map((designer) => <option value={designer.id} key={designer.id}>{designer.name}</option>)}</select></label> : <label>Review note<textarea value={noteByEstimate[estimate.id] ?? ""} onChange={(event) => setNoteByEstimate((current) => ({ ...current, [estimate.id]: event.target.value }))} placeholder={role === "client" ? "Optional note for the Lisno team" : "Add approval context or requested corrections"} /></label>)}
      {actionable ? <div className="estimate-review-card__actions">
        {role === "design_manager"
          ? <button className="button button--primary" type="button" disabled={!designerByEstimate[estimate.id] || action.isPending} onClick={() => action.mutate({ id: estimate.id, action: "assign" })}>Assign designer</button>
          : <><button className="button button--secondary" type="button" disabled={action.isPending} onClick={() => action.mutate({ id: estimate.id, action: "changes" })}>Request changes</button><button className="button button--primary" type="button" disabled={action.isPending} onClick={() => action.mutate({ id: estimate.id, action: "approve" })}>{role === "client" ? "Approve estimate" : "Approve for client"}</button></>}
      </div> : null}
    </article>;
    })}</div>
    {action.isError ? <p role="alert">That action could not be completed. Refresh and try again.</p> : null}
  </section>;
}

function canActOnEstimate(role: string, status: EstimateQueueItem["status"]) {
  if (role === "client") return status === "sent_to_client";
  if (role === "design_manager") return status === "pending_manager_assignment";
  return status === "pending_designer_approval";
}

function ClientEstimateDetails({ estimate }: { estimate: Awaited<ReturnType<typeof getClientEstimates>>[number] }) {
  const included = estimate.lineItems.filter((item) => item.included);
  const groups = estimateBuilderSections.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    items: included.filter((item) => catalogue.get(item.catalogueId)?.sectionId === section.id)
  })).filter((section) => section.items.length);

  return <details className="client-estimate-details" open>
    <summary>Review section-wise estimate</summary>
    <div className="client-estimate-sections">
      {groups.map((section) => <details className="client-estimate-section" open key={section.id}>
        <summary>
          <h4>{section.icon} {section.label}</h4>
          <strong>{money(section.items.reduce((sum, item) => sum + Math.round(item.quantity * item.rate), 0))}</strong>
        </summary>
        <div className="client-estimate-lines">
          {section.items.map((item) => <div className="client-estimate-line" key={`${item.roomName}-${item.catalogueId}`}>
            <span>
              <strong>{catalogue.get(item.catalogueId)?.description ?? item.catalogueId}</strong>
              <small>{item.roomName} · {item.specification}</small>
            </span>
            <span>{item.quantity} {item.unit} × {money(item.rate)}</span>
            <strong>{money(Math.round(item.quantity * item.rate))}</strong>
          </div>)}
        </div>
      </details>)}
      <div className="client-estimate-totals">
        <span>Subtotal <strong>{money(estimate.subtotal)}</strong></span>
        <span>GST @ 18% <strong>{money(estimate.gst)}</strong></span>
        <span>Final estimate <strong>{money(estimate.total)}</strong></span>
      </div>
    </div>
  </details>;
}
