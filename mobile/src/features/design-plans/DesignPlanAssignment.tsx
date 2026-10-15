import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeSelect, KnowledgeText } from "../knowledge/knowledgeUi";
import { assignPlanDesigner, designPlanKeys, getPlanDesigners } from "./designPlanApi";
import { DesignCommandState, useDesignCommand, useDesignOwner, useDesignRefresh } from "./DesignPlanControls";
export interface DesignPlanAssignmentProps { readonly projectId: string; readonly session: AuthenticatedSession; readonly estimateStatus?: string | null; readonly designPlanStatus?: string | null; readonly assignedDesignerId?: string | null; readonly onChanged?: () => Promise<unknown> | void }
export function DesignPlanAssignment(props: DesignPlanAssignmentProps) {
  const context = useConfiguredRuntime();
  if (!canPerformOperation(props.session, "POST /admin/projects/:projectId/design-assignment")) return null;
  return <Assignment key={`${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${props.projectId}:${props.session.user.id}`} {...props} />;
}
function Assignment({ projectId, session, estimateStatus, designPlanStatus, assignedDesignerId, onChanged }: DesignPlanAssignmentProps) {
  const owner = useDesignOwner(projectId, session); const refresh = useDesignRefresh(session); const [designerId, setDesignerId] = useState(assignedDesignerId ?? ""); const [denied, setDenied] = useState(false); const [notice, setNotice] = useState("");
  const eligible = estimateStatus === "client_approved" && designPlanStatus !== "ready_for_client" && designPlanStatus !== "approved";
  const query = useQuery({ queryKey: [...designPlanKeys.all(owner.scope), "assignment-designers"], queryFn: ({ signal }) => getPlanDesigners(owner.context.runtime, signal), enabled: eligible && !denied && canPerformOperation(session, "GET /admin/designers"), retry: false });
  const command = useDesignCommand(owner, async () => { await refresh(); await onChanged?.(); }, () => setDenied(true));
  return <KnowledgeCard title="Design plan assignment">
    {estimateStatus !== "client_approved" ? <KnowledgeText>Design assignment opens after Client estimate approval.</KnowledgeText> : designPlanStatus === "ready_for_client" || designPlanStatus === "approved" ? <KnowledgeText>{designPlanStatus === "approved" ? "The approved Design plan is locked." : "The submitted plan is locked while Client review is pending."}</KnowledgeText> : <>
      {denied ? <KnowledgeText>Designer assignment is unavailable for your current access.</KnowledgeText> : <><KnowledgeSelect label="Assigned Designer" value={designerId} onChange={setDesignerId} disabled={query.isFetching || query.isError || command.busy || command.blocked} options={(query.data ?? []).map(designer => ({ value: designer.id, label: `${designer.name} · ${designer.email}` }))} />{query.isError ? <><KnowledgeText error>Active Designers could not be loaded.</KnowledgeText><Button label="Retry active Designers" onPress={() => void query.refetch()} /></> : null}<Button label={assignedDesignerId ? "Reassign Designer" : "Assign Designer"} loading={command.busy} disabled={!eligible || query.isFetching || query.isError || command.blocked || !query.data?.some(designer => designer.id === designerId)} onPress={() => { const id = designerId; void command.run(() => assignPlanDesigner(owner.context.runtime, projectId, id), { replaySafe: false, after: () => setNotice("Designer assigned. The design-plan task is open.") }); }} /></>}
    </>}
    {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}<DesignCommandState command={command} onRefresh={async () => { await refresh(); await onChanged?.(); command.reset(); }} />
  </KnowledgeCard>;
}
