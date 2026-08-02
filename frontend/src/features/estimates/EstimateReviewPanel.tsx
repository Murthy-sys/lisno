import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { Role } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { DownloadButton } from "../../components/ui/DownloadButton";
import {
  assignEstimateDesigner,
  decideEstimateAsClient,
  decideEstimateAsDesigner,
  downloadClientEstimatePdf,
  estimateWorkflowKeys,
  type EstimateQueueItem,
  getClientEstimates,
  getEstimateDesigners,
  getEstimateReviewQueue
} from "./estimateWorkflowApi";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import {
  estimateDesignKeys,
  getClientEstimateDrawings,
  getClientPlanWorkspace,
  previewClientPlanTargets,
  saveClientPlanDraft,
  submitClientPlanChangeRequest
} from "../leads/estimateDesignApi";
import {
  ClientEstimateDrawings,
  clientDrawingReadinessId
} from "./ClientEstimateDrawings";
import { clientKeys } from "../client/clientApi";
import type { EstimatePlanPage } from "../../api/types";
import { ClientFullPlanNav } from "./ClientFullPlanNav";
import { AskLisnoLauncher } from "./AskLisnoLauncher";
import { ClientPlanPageReview } from "./ClientPlanPageReview";

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
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({
        queryKey: role === "client" ? estimateWorkflowKeys.client : estimateWorkflowKeys.reviewQueue
      });
      if (role === "client") {
        await queryClient.invalidateQueries({
          queryKey: estimateDesignKeys.clientWorkspace(input.id)
        });
        if (input.action === "approve") {
          await queryClient.invalidateQueries({
            queryKey: clientKeys.projects
          });
        }
      }
    },
    onError: async (_, input) => {
      if (role === "client" && input.action === "approve") {
        await queryClient.invalidateQueries({
          queryKey: estimateDesignKeys.clientWorkspace(input.id)
        });
      }
    }
  });

  if (queue.isPending) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p>Loading estimate queue…</p></section>;
  if (queue.isError) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p role="alert">Estimate queue is temporarily unavailable.</p></section>;
  if (!queue.data.length) return <section className="estimate-review-panel"><h2>Estimate approvals</h2><p className="inline-empty">Nothing needs your action right now.</p></section>;
  const actionableCount = queue.data.filter((estimate) => canActOnEstimate(role, estimate.status)).length;

  return <section className="estimate-review-panel" aria-labelledby="estimate-review-title">
    <header><div><p className="eyebrow">Commercial workflow</p><h2 id="estimate-review-title">{role === "client" ? "Estimates ready for you" : "Estimate approvals"}</h2></div><strong>{actionableCount} awaiting action</strong></header>
    <div className="estimate-review-grid">{queue.data.map((estimate) => <EstimateReviewCard
      actionable={canActOnEstimate(role, estimate.status)}
      actionError={action.isError && action.variables?.id === estimate.id
        ? action.error
        : null}
      actionPending={action.isPending && action.variables?.id === estimate.id}
      designers={designers.data ?? []}
      estimate={estimate}
      key={estimate.id}
      note={noteByEstimate[estimate.id] ?? ""}
      role={role}
      selectedDesignerId={designerByEstimate[estimate.id] ?? ""}
      onAction={(actionType) => action.mutate({ id: estimate.id, action: actionType })}
      onDesignerChange={(designerId) => setDesignerByEstimate((current) => ({ ...current, [estimate.id]: designerId }))}
      onNoteChange={(note) => setNoteByEstimate((current) => ({ ...current, [estimate.id]: note }))}
    />)}</div>
    {role !== "client" && action.isError ? <p role="alert">That action could not be completed. Refresh and try again.</p> : null}
  </section>;
}

function canActOnEstimate(role: string, status: EstimateQueueItem["status"]) {
  if (role === "client") return status === "sent_to_client";
  if (role === "design_manager") return status === "pending_manager_assignment";
  return status === "pending_designer_approval";
}

function EstimateReviewCard({
  estimate,
  role,
  actionable,
  designers,
  selectedDesignerId,
  note,
  actionError,
  actionPending,
  onDesignerChange,
  onNoteChange,
  onAction
}: {
  estimate: EstimateQueueItem;
  role: Role;
  actionable: boolean;
  designers: Awaited<ReturnType<typeof getEstimateDesigners>>;
  selectedDesignerId: string;
  note: string;
  actionError: Error | null;
  actionPending: boolean;
  onDesignerChange: (designerId: string) => void;
  onNoteChange: (note: string) => void;
  onAction: (action: "assign" | "approve" | "changes") => void;
}) {
  const queryClient = useQueryClient();
  const [clientExpanded, setClientExpanded] = useState(false);
  const [selectedPlanPage, setSelectedPlanPage] = useState<EstimatePlanPage>();
  const isClient = role === "client";
  const detailsId = `client-estimate-${estimate.id}-details`;
  const headingId = `client-estimate-${estimate.id}-title`;
  const includedItemCount = estimate.lineItems.filter((item) => item.included).length;
  const drawingWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientWorkspace(estimate.id),
    queryFn: () => getClientEstimateDrawings(estimate.id),
    enabled: isClient && clientExpanded
  });
  const planWorkspace = useQuery({
    queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id),
    queryFn: () => getClientPlanWorkspace(estimate.id),
    enabled: isClient && clientExpanded
  });
  const roomOptions = estimate.rooms.flatMap((room) => {
    const id = typeof room.id === "string" ? room.id : "";
    const label = typeof room.label === "string" ? room.label : "";
    return id && label ? [{ id, label }] : [];
  });
  const scopeOptions = estimate.scopes.map((id) => ({
    id,
    label: estimateBuilderSections.find((section) => section.id === id)?.label ?? id
  }));
  const clientApprovalBlocked = isClient &&
    drawingWorkspace.data?.readiness.ready !== true;

  const reviewControls = actionable ? <>
    {role === "design_manager" ? <label>Assign approval to<select value={selectedDesignerId} onChange={(event) => onDesignerChange(event.target.value)}><option value="">Choose designer</option>{designers.map((designer) => <option value={designer.id} key={designer.id}>{designer.name}</option>)}</select></label> : <label>Review note<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder={isClient ? "Optional note for the Lisno team" : "Add approval context or requested corrections"} /></label>}
    <div className="estimate-review-card__actions">
      {role === "design_manager"
        ? <button className="button button--primary" type="button" disabled={!selectedDesignerId || actionPending} onClick={() => onAction("assign")}>Assign designer</button>
        : <><button className="button button--secondary" type="button" disabled={actionPending} onClick={() => onAction("changes")}>Request changes</button><button className="button button--primary" type="button" aria-describedby={isClient ? clientDrawingReadinessId(estimate.id) : undefined} disabled={actionPending || clientApprovalBlocked} onClick={() => onAction("approve")}>{isClient ? "Approve estimate" : "Approve for client"}</button></>}
    </div>
    {actionError ? <p role="alert">{actionError instanceof ApiError ? actionError.message : "That action could not be completed. Refresh and try again."}</p> : null}
  </> : null;

  if (isClient) {
    return <article className="estimate-review-card estimate-review-card--client">
      <div className={`estimate-review-card__client-header${clientExpanded ? " estimate-review-card__client-header--expanded" : ""}`}>
        <h3 id={headingId}>{estimate.lead?.projectName}</h3>
        <strong className="estimate-review-card__total">{money(estimate.total)}</strong>
        {clientExpanded ? <DownloadButton
          className="button button--secondary estimate-review-card__export"
          label="Export as PDF"
          loadingLabel="Preparing PDF..."
          errorMessage={`PDF export failed for ${estimate.lead?.projectName ?? "this estimate"}. Try again.`}
          fallbackFilename={`lisno-${estimate.id}.pdf`}
          getFile={() => downloadClientEstimatePdf(estimate.id)}
        /> : null}
        <button className="estimate-review-card__toggle" type="button" aria-labelledby={headingId} aria-expanded={clientExpanded} aria-controls={detailsId} onClick={() => setClientExpanded((current) => !current)}><span aria-hidden="true">{clientExpanded ? "Hide details" : "View estimate"}</span><ChevronDown aria-hidden="true" /></button>
      </div>
      {clientExpanded ? <div className="estimate-review-card__client-content" id={detailsId}>
        <div className="client-estimate-workspace">
          <div className="client-estimate-workspace__main">
            <p className="eyebrow">{estimate.lead?.location}</p>
            <p>{estimate.lead?.clientName}</p>
            <p>{includedItemCount} items · GST included</p>
            <ClientEstimateDetails estimate={estimate} />
            {planWorkspace.isPending ? <p role="status">Loading full design pages…</p> : null}
            {planWorkspace.isError ? <p className="inline-empty">No full design pages are available for this estimate.</p> : null}
            <ClientEstimateDrawings
              estimateId={estimate.id}
              rooms={roomOptions}
              scopes={scopeOptions}
              workspace={drawingWorkspace.data}
              isPending={drawingWorkspace.isPending}
              isError={drawingWorkspace.isError}
              canReview={actionable}
              planWorkspace={planWorkspace.data}
            />
            {!actionable ? <p className="estimate-notice">{estimate.status === "client_approved" ? "Estimate approved" : "Changes requested"}</p> : null}
            {reviewControls}
          </div>
          {planWorkspace.data?.pages.length ? (
            <aside className="client-estimate-workspace__rail" aria-label="Design tools">
              <ClientFullPlanNav
                workspace={planWorkspace.data}
                selectedPageId={selectedPlanPage?.id}
                onSelectPage={setSelectedPlanPage}
              />
              <AskLisnoLauncher />
            </aside>
          ) : null}
        </div>
        {selectedPlanPage ? (
          <ClientPlanPageReview
            page={selectedPlanPage}
            canReview={actionable}
            onClose={() => setSelectedPlanPage(undefined)}
            saveDraft={async (annotations) => {
              await saveClientPlanDraft(selectedPlanPage.id, selectedPlanPage.annotationDraft?.version ?? 0, annotations);
              await queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) });
            }}
            previewTargets={(annotations) => previewClientPlanTargets(selectedPlanPage.id, annotations)}
            submitRequest={async (input) => {
              await submitClientPlanChangeRequest(selectedPlanPage.id, input);
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimate.id) }),
                queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(estimate.id) })
              ]);
            }}
          />
        ) : null}
      </div> : null}
    </article>;
  }

  return <article className="estimate-review-card">
    <div><p className="eyebrow">{estimate.lead?.location}</p><h3>{estimate.lead?.projectName}</h3><p>{estimate.lead?.clientName}</p></div>
    <strong className="estimate-review-card__total">{money(estimate.total)}</strong>
    <p>{includedItemCount} items · GST included</p>
    {reviewControls}
  </article>;
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
          <h4><span aria-hidden="true">{section.icon}</span> {section.label}</h4>
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
