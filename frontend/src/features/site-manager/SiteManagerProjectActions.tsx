import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import type { ExecutionProjectMetadata } from "../execution/executionApi";
import { ExecutionPolicyPanel } from "../execution/ExecutionPolicyPanel";
import { ProjectChatLink } from "../messages";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { OperationalTaskQueue } from "../workflow/OperationalTaskQueue";
import { SiteCompletionPanel } from "../workflow/SiteCompletionPanel";

export function SiteManagerProjectActions({ project, canManagePolicy, onDirty, onBusy, disabled = false }: { project: ExecutionProjectMetadata; canManagePolicy: boolean; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const auth = useAuth();
  const [panel, setPanel] = useState<"completion" | "policy" | "legacy" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => { onDirty(false); onBusy(false); }, [onDirty, onBusy]);
  const canComplete = hasFrontendPermission(auth.authorization, "procurement.site_completion.manage");
  return <>
    <details className="site-workspace__project-actions"><summary>Project actions</summary><div>
      {project.completionAuthority === "vendor_client" && canComplete ? <Button size="compact" variant="secondary" disabled={disabled} onClick={() => setPanel("completion")}>Completion &amp; Client handoff</Button> : null}
      {project.completionAuthority === "legacy_staff" ? <Button size="compact" variant="secondary" disabled={disabled} onClick={() => setPanel("legacy")}>Coordination progress</Button> : null}
      {canManagePolicy ? <Button size="compact" variant="secondary" disabled={disabled} onClick={() => setPanel("policy")}>Reporting schedule</Button> : null}
      <ProjectStatusButton projectId={project.id} projectName={project.name} participant />
      <ProjectChatLink projectId={project.id}>Project messages</ProjectChatLink>
    </div></details>
    {panel === "completion" ? <ContextPanel className="site-workspace-panel" title="Completion & Client handoff" description={project.name} width="medium" dirty={dirty} busy={busy} onClose={() => { setPanel(null); setDirty(false); }}><SiteCompletionPanel projectId={project.id} projectName={project.name} onDirty={setDirty} onBusy={setBusy} /></ContextPanel> : null}
    {panel === "legacy" ? <ContextPanel className="site-workspace-panel" title="Coordination progress" description={project.name} width="medium" dirty={dirty} busy={busy} onClose={() => setPanel(null)}><OperationalTaskQueue role="site_manager" selectedProjectId={project.id} onDirty={setDirty} onBusy={setBusy} /></ContextPanel> : null}
    {panel === "policy" ? <ExecutionPolicyPanel onDirty={setDirty} onBusy={setBusy} projectId={project.id} onClose={() => setPanel(null)} /> : null}
  </>;
}
