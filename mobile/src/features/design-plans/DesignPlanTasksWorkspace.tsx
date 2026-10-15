import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { z } from "zod";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiProtocolError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { Button } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { WorkflowWorkspace } from "../workflows/WorkflowWorkspace";
import { designPlanKeys, getDesignPlanTasks, reconcilePlanScope } from "./designPlanApi";
import { designTaskOptions, type DesignPlanTask } from "./designPlanModel";
import { DesignCommandState, isDesignDenied, useDesignCommand, useDesignOwner, useDesignRefresh } from "./DesignPlanControls";
import { EstimateDesignPreparation } from "./EstimateDesignPreparation";

const operationalSchema = z.object({ status: z.enum(["not_started", "in_progress", "in_review", "blocked", "completed"]), blockingReasons: z.array(z.string()), timing: z.object({ state: z.string() }), spacePlanning: z.object({ estimateId: z.string(), designPlanVersion: z.number().int().nonnegative(), reviewRoundId: z.string().nullable() }).passthrough().optional(), availableActions: z.array(z.object({ id: z.string(), label: z.string(), disabledReason: z.string().optional() })) });
export const designPlanWorkflowSchema = z.object({ projectId: z.string(), initialPayment: z.object({ workflowVersion: z.literal(2).optional(), designStartedAt: z.string().nullable().optional(), confirmedAt: z.string().nullable() }).optional(), projectStages: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), order: z.number(), status: z.string().optional(), operational: operationalSchema.optional() })).optional() });
export type PlanWorkflow = z.infer<typeof designPlanWorkflowSchema>;
export function designPlanEligibility(task: DesignPlanTask, workflow: PlanWorkflow) {
  const stages = [...(workflow.projectStages ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); const current = stages.find(stage => (stage.operational?.status ?? stage.status) !== "completed"); const upload = stages.find(stage => stage.type === "space_planning_tentative_look_feel"); const operational = upload?.operational;
  const sourceMatches = workflow.projectId === task.projectId && operational?.spacePlanning?.estimateId === task.estimateId;
  const started = workflow.initialPayment?.workflowVersion === 2 ? Boolean(workflow.initialPayment.designStartedAt) : Boolean(workflow.initialPayment?.confirmedAt);
  const work = Boolean(sourceMatches && upload && current?.id === upload.id && started && operational && ["in_progress", "in_review"].includes(operational.status) && !operational.blockingReasons.length && !["waiting", "paused"].includes(operational.timing.state));
  const message = !sourceMatches ? "The current design source is unavailable for this estimate." : !started ? "Await the project design start milestone." : current?.id !== upload?.id ? current ? `Complete ${current.name} before uploading designs.` : "Project design stages are complete." : operational?.blockingReasons[0] ?? (["waiting", "paused"].includes(operational?.timing.state ?? "") ? "Project work is waiting or paused." : task.status === "ready_for_client" ? "Await Client approval." : task.status === "approved" ? "Approved design." : "Upload or review extracted drawings.");
  return { show: Boolean(sourceMatches && upload && (current?.id === upload.id || (operational?.status ?? upload.status) === "completed")), editable: work && ["assigned", "in_progress", "changes_requested"].includes(task.status), allowDeletion: work && !["pending_assignment", "approved"].includes(task.status), message };
}
export interface DesignPlanTasksWorkspaceProps { readonly session: AuthenticatedSession; readonly initialEstimateId?: string | null; readonly projectId?: string; readonly onOpenProject?: (projectId: string) => void; readonly onOpenEstimate?: (leadId: string) => void }
export function DesignPlanTasksWorkspace(props: DesignPlanTasksWorkspaceProps) {
  const context = useConfiguredRuntime();
  if (!canPerformOperation(props.session, "GET /designer/design-plan-tasks")) return <KnowledgeCard title="Design plan workspace"><KnowledgeText>Design plan tasks are unavailable for your current role.</KnowledgeText></KnowledgeCard>;
  return <Tasks key={`${context.environment.environment.id}:${context.session.generation}:${props.session.user.id}:${props.projectId ?? "queue"}`} {...props} />;
}
function Tasks({ session, initialEstimateId, projectId, onOpenProject, onOpenEstimate }: DesignPlanTasksWorkspaceProps) {
  const owner = useDesignOwner("plan-tasks", session); const [selectedId, setSelectedId] = useState(initialEstimateId ?? "");
  const blocked = useScaffoldNavigationBlocked(); const retained = useRef<DesignPlanTask | null>(null);
  useEffect(() => { if (initialEstimateId) setSelectedId(initialEstimateId); }, [initialEstimateId]);
  const query = useQuery({ queryKey: designPlanKeys.tasks(owner.scope), queryFn: ({ signal }) => getDesignPlanTasks(owner.context.runtime, signal), enabled: !blocked, retry: false, refetchOnWindowFocus: !blocked });
  if (query.isPending) return <KnowledgeText>Loading assigned design plans…</KnowledgeText>;
  if (query.isError) return <KnowledgeCard title="Design plan workspace"><KnowledgeText error>{isDesignDenied(query.error) ? "Assigned designs are unavailable for your current access." : "Assigned designs could not be loaded."}</KnowledgeText><Button label="Retry Design tasks" onPress={() => void query.refetch()} /></KnowledgeCard>;
  const tasks = query.data.filter(task => !projectId || task.projectId === projectId); const candidate = selectedId ? tasks.find(task => task.estimateId === selectedId) : tasks[0]; if (!blocked) retained.current = candidate ?? null; const selected = blocked ? retained.current ?? candidate : candidate;
  return <ScrollView contentContainerStyle={styles.screen}>
    <KnowledgeCard title="Assigned Design plans"><KnowledgeText>Complete the project stages, prepare the drawings and submit the current plan for Client approval.</KnowledgeText>{!tasks.length ? <KnowledgeText>No Design plans are assigned to you for this project.</KnowledgeText> : tasks.map(task => <KnowledgeChoice key={task.id} label={`${task.projectName} · ${task.clientName} · ${task.status.replaceAll("_", " ")}`} selected={selected?.id === task.id} disabled={blocked && selected?.id !== task.id} onPress={() => setSelectedId(task.estimateId)} />)}<Button label="Refresh assigned Design plans" variant="quiet" disabled={blocked} loading={query.isFetching} onPress={() => void query.refetch()} /></KnowledgeCard>
    {selected ? <SelectedPlan key={selected.estimateId} task={selected} session={session} checking={query.isFetching} onOpenProject={onOpenProject} onOpenEstimate={onOpenEstimate} /> : selectedId ? <KnowledgeText>The linked Design plan is not in your current assigned queue. Choose an available project.</KnowledgeText> : null}
  </ScrollView>;
}
function SelectedPlan({ task, session, checking, onOpenProject, onOpenEstimate }: { readonly task: DesignPlanTask; readonly session: AuthenticatedSession; readonly checking: boolean; readonly onOpenProject: ((projectId: string) => void) | undefined; readonly onOpenEstimate: ((leadId: string) => void) | undefined }) {
  const blocked = useScaffoldNavigationBlocked();
  const owner = useDesignOwner(task.projectId, session); const refresh = useDesignRefresh(session); const [reconcileOpen, setReconcileOpen] = useState<{ expectedDesignPlanVersion: number; expectedScopeRevision: number } | null>(null); const [denied, setDenied] = useState(false); const command = useDesignCommand(owner, refresh, () => setDenied(true));
  const workflow = useQuery({ queryKey: [...designPlanKeys.all(owner.scope), "plan-eligibility", task.projectId], queryFn: async ({ signal }) => { const value = designPlanWorkflowSchema.safeParse(await owner.context.runtime.api.authenticated.get(`/projects/${encodeURIComponent(task.projectId)}/design-workflow`, { signal })); if (!value.success || value.data.projectId !== task.projectId) throw new ApiProtocolError(); return value.data; }, retry: false, enabled: !denied && !blocked && canPerformOperation(session, "GET /projects/:projectId/design-workflow"), refetchInterval: blocked ? false : 10_000, refetchOnWindowFocus: !blocked });
  const availability = workflow.data ? designPlanEligibility(task, workflow.data) : null;
  const fresh = !checking && !workflow.isFetching && !workflow.isError && !denied;
  if (denied || isDesignDenied(workflow.error)) return <KnowledgeText>This project workflow is unavailable for your current access.</KnowledgeText>;
  return <View style={styles.stack}>
    <KnowledgeCard title={task.projectName}><KnowledgeText>{task.clientName} · Design plan v{task.designPlanVersion} · {task.status.replaceAll("_", " ")}</KnowledgeText><KnowledgeText>{workflow.isError ? "Refresh the project workflow before making changes." : !fresh ? "Checking the current project workflow…" : availability?.message}</KnowledgeText>
      {task.estimationWorkflowVersion === 2 ? <KnowledgeText>Design begins after pre-estimate approval. Initial payment is confirmed after design and final estimate approval.</KnowledgeText> : null}
      {onOpenProject ? <Button label="Open project details" variant="quiet" disabled={blocked} onPress={() => onOpenProject(task.projectId)} /> : null}
      {task.estimationWorkflowVersion === 2 && task.leadId && onOpenEstimate ? <Button label="Review and edit post-estimate" variant="quiet" disabled={blocked} onPress={() => onOpenEstimate(task.leadId!)} /> : null}
      {task.scopeReconciliation?.required && canPerformOperation(session, "POST /projects/:projectId/design-plan/reconcile-scope") ? <><KnowledgeText>The estimate scope changed after design approval. Reopen design for the current scope before submitting the final estimate.</KnowledgeText><Button label="Reconcile design scope" disabled={!fresh || command.busy} onPress={() => { command.reset(); setReconcileOpen({ expectedDesignPlanVersion: task.designPlanVersion, expectedScopeRevision: task.scopeReconciliation!.designScopeRevision }); }} /></> : null}
      <Button label="Refresh project Design workflow" variant="quiet" disabled={blocked} onPress={() => void workflow.refetch()} />
    </KnowledgeCard>
    <WorkflowWorkspace projectId={task.projectId} session={session} />
    {availability?.show ? <EstimateDesignPreparation estimateId={task.estimateId} session={session} {...designTaskOptions(task)} designerMode readOnly={!fresh || !availability.editable} allowDeletion={fresh && availability.allowDeletion} /> : null}
    {reconcileOpen && task.scopeReconciliation ? <KnowledgeModal title="Reopen Design review for changed scope?" busy={command.busy} onClose={() => setReconcileOpen(null)}><KnowledgeText>Existing uploads and approval history remain. Review the affected drawings and submit them for Client approval again.</KnowledgeText><DesignCommandState command={command} onRefresh={async () => { await refresh(); setReconcileOpen(null); }} /><Button label="Reopen design review" loading={command.busy} disabled={!fresh || command.blocked || reconcileOpen.expectedDesignPlanVersion !== task.designPlanVersion || reconcileOpen.expectedScopeRevision !== task.scopeReconciliation.designScopeRevision} onPress={() => { const input = reconcileOpen; void command.run(() => reconcilePlanScope(owner.context.runtime, task.projectId, input), { replaySafe: true, after: () => setReconcileOpen(null) }); }} /></KnowledgeModal> : null}
  </View>;
}
