import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { ClientQuotation } from "../client/ClientQuotation";
import { ClientEstimationWorkspace } from "../client/ClientEstimationWorkspace";
import { getQuotation, quotationKeys } from "../client/quotationApi";
import { getDesignerPlanTasks, projectWorkflowKeys } from "../workflow/projectWorkflowApi";

/** Project-scoped safe quotation view; the primary Designer's editor stays on the staff route. */
export function ProjectQuotationWorkspace() {
  const { projectId = "" } = useParams();
  const { user, reviewSession } = useAuth();
  return <QuotationForProject key={JSON.stringify([projectId, user?.id, user?.role, reviewSession?.id])} projectId={projectId} client={user?.role === "client"} />;
}

function QuotationForProject({ projectId, client }: { projectId: string; client: boolean }) {
  return <section className="project-quotation-workspace" aria-labelledby="project-estimation-title">
    <PageHeader id="project-estimation-title" title="Estimation"
      actions={!client ? <DesignerEstimateAction projectId={projectId} /> : undefined}
      breadcrumb={<Link to={client ? `/client/projects/${encodeURIComponent(projectId)}` : "/designer/design-plans"}>{client ? "Back to project" : "Back to design plans"}</Link>} />
    {client ? <ClientEstimationWorkspace projectId={projectId} workspace /> : <ClientQuotation projectId={projectId} workspace readOnly />}
  </section>;
}

function DesignerEstimateAction({ projectId }: { projectId: string }) {
  const { user, reviewSession } = useAuth();
  const enabled = user?.role === "designer" && Boolean(projectId);
  const tasks = useQuery({
    queryKey: [...projectWorkflowKeys.designerPlans, user?.id, user?.role, reviewSession?.id],
    queryFn: getDesignerPlanTasks, enabled, retry: false, refetchOnMount: "always"
  });
  const quotation = useQuery({
    queryKey: quotationKeys.detail(projectId), queryFn: () => getQuotation(projectId),
    enabled, retry: false, refetchOnMount: "always"
  });
  if (!enabled) return null;
  if (tasks.isError || quotation.isError) return <div role="alert">
    <p>Estimate editing access could not be checked.</p>
    <Button variant="secondary" disabled={tasks.isFetching || quotation.isFetching}
      onClick={() => { void tasks.refetch(); void quotation.refetch(); }}>Retry editing access</Button>
  </div>;
  if (tasks.isFetching || quotation.isFetching || !tasks.isFetchedAfterMount || !quotation.isFetchedAfterMount) return null;
  const detail = quotation.data;
  if (!detail?.estimateId || detail.projectId !== projectId || detail.phase !== "post") return null;
  const matchingTasks = tasks.data?.filter(task => task.projectId === projectId && task.estimateId === detail.estimateId) ?? [];
  const task = matchingTasks.length === 1 ? matchingTasks[0] : undefined;
  if (!task?.leadId || task.estimationWorkflowVersion !== 3 || task.canEditQuotation !== true) return null;
  const state = task.quotationApprovalState;
  if (!state || state === "source_issue" || detail.quotationApprovalState !== state) return null;
  const editable = detail.editingAllowed && ["initial_current", "revision_draft", "revision_changes_requested"].includes(state);
  return <Link className={`ui-button ui-button--${editable ? "primary" : "secondary"}`}
    to={`/estimator-sales/leads/${encodeURIComponent(task.leadId)}/estimate`}>{editable ? "Add / edit estimate items" : "View estimate"}</Link>;
}
