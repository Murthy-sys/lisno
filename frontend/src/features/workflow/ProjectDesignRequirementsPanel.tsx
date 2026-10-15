import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { projectReadDenied } from "../projects/projectReadQueries";
import { purchaseOrderKeys } from "../procurement/purchaseOrderApi";
import { procurementBasketKeys } from "../procurement/procurementBasketApi";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
import { actOnProjectDesignRequirement, getProjectDesignRequirements, projectDesignRequirementsKeys, type DesignRequirementCommand, type DesignRequirementAction, type ProjectDesignRequirement } from "./projectDesignRequirementsApi";
import "./project-design-requirements.css";

const categories = {
  selection: "Physical Selection Sheet", critical: "Critical Designer Checklist",
  po_approval: "Designer PO Approval Checklist", stock: "Critical supply checks"
} as const;
const statusLabels = { pending: "Pending", approved: "Approved", completed: "Completed", deferred: "During-project selection" } as const;
const actionLabels = { complete: "Mark complete", approve: "Approve", defer: "Defer to during-project selection", reopen: "Reopen" } as const;
export function ProjectDesignRequirementsPanel({ projectId, identity }: { projectId: string; identity: string }) {
  const client = useQueryClient(); const refresh = useRefreshDesignWorkflow(); const id = useId(); const lock = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [retryCommand, setRetryCommand] = useState<DesignRequirementCommand | null>(null);
  const key = projectDesignRequirementsKeys.detail(projectId, identity);
  const query = useQuery({ queryKey: key, queryFn: () => getProjectDesignRequirements(projectId), refetchInterval: 60_000 });
  const data = projectReadDenied(query.error) ? undefined : query.data;
  async function execute(command: DesignRequirementCommand): Promise<boolean> {
    if (lock.current) return false; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await actOnProjectDesignRequirement(projectId, command);
      client.setQueryData(key, next); setRetryCommand(null); setNotice("Design requirement updated.");
      await Promise.allSettled([refresh(), client.invalidateQueries({ queryKey: projectDesignRequirementsKeys.all }), client.invalidateQueries({ queryKey: purchaseOrderKeys.project(projectId) }), client.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) }), client.invalidateQueries({ queryKey: purchaseOrderKeys.requests(projectId) }), client.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) }), client.invalidateQueries({ queryKey: purchaseOrderKeys.pending }), client.invalidateQueries({ queryKey: purchaseOrderKeys.pendingRequests }), client.invalidateQueries({ queryKey: procurementBasketKeys.details() })]);
      return true;
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408) {
        setRetryCommand(command); setError("The update could not be confirmed. Retry the same action to recover its saved result.");
      } else {
        setRetryCommand(null); setError(cause.status === 409 ? "These requirements changed. The latest state is being loaded; review it before acting again." : cause.message);
        await query.refetch();
      }
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return <Surface as="section" id="design-requirements" className="project-design-requirements" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{data?.canReadInternal === false ? "Selections requiring your approval" : "Design requirements"}</h2>
    {query.isPending ? <p role="status">Loading design requirements…</p> : null}
    {query.isError ? <InlineMessage tone="error" role="alert">Design requirements could not be refreshed. Actions are unavailable until the current state is loaded.<Button variant="secondary" onClick={() => void query.refetch()}>Retry requirements</Button></InlineMessage> : null}
    {data && !data.entries.length ? <p>No configured design requirements for the current estimate.</p> : null}
    {data?.canReadInternal && data.blockers.length ? <details className="design-requirements-blockers"><summary>{data.blockers.length} requirement{data.blockers.length === 1 ? "" : "s"} need attention before design submission</summary><ul>{data.blockers.map((text, index) => <li key={index}>{text}</li>)}</ul></details> : null}
    {data ? (Object.keys(categories) as Array<keyof typeof categories>).map((category) => {
      const entries = data.entries.filter((entry) => entry.category === category);
      if (!entries.length || (!data.canReadInternal && category !== "selection")) return null;
      return <section className="design-requirements-group" key={category} aria-labelledby={`${id}-${category}`}><h3 id={`${id}-${category}`}>{categories[category]}</h3>
        {category === "stock" ? <p>Complete stock checks within four days after initial payment confirmation. The recorded deadline remains fixed.</p> : null}
        {entries.map((entry) => <RequirementRow key={`${entry.id}:${data.sourceToken}`} entry={entry} disabled={busy || query.isError || query.isFetching || Boolean(retryCommand)} internal={data.canReadInternal} onAction={(action, note, checkedPointIds) => execute({ expectedVersion: data.version, sourceToken: data.sourceToken, entryId: entry.id, action, note, checkedPointIds, idempotencyKey: crypto.randomUUID() })} />)}
      </section>;
    }) : null}
    {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    {retryCommand ? <Button variant="secondary" busy={busy} onClick={() => void execute(retryCommand)}>Retry saved action</Button> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </Surface>;
}
function RequirementRow({ entry, disabled, internal, onAction }: { entry: ProjectDesignRequirement; disabled: boolean; internal: boolean; onAction: (action: DesignRequirementAction, note: string, checked: string[]) => Promise<boolean> }) {
  const id = useId(); const [note, setNote] = useState(""); const [checked, setChecked] = useState<string[]>(entry.checkedPointIds ?? []);
  const [validation, setValidation] = useState("");
  const points = internal ? entry.checklist ?? [] : [];
  async function act(action: DesignRequirementAction) {
    if (!note.trim()) { setValidation(action === "defer" ? "Explain why this selection will be completed during the project." : "Add an evidence or decision note before saving."); return; }
    if (action === "approve" && points.some((point) => !checked.includes(point.id))) { setValidation("Confirm every Designer PO checklist point before approving."); return; }
    setValidation(""); if (await onAction(action, note.trim(), action === "approve" && entry.category === "po_approval" ? checked : [])) setNote("");
  }
  return <article className="design-requirement-row" aria-labelledby={`${id}-title`}>
    <header><div><h4 id={`${id}-title`}>{entry.lineName}</h4><p>{entry.label}</p></div><span className="design-requirement-status">{statusLabels[entry.status]}</span></header>
    {entry.details ? <p>{entry.details}</p> : null}
    {entry.dueAt ? <p>Due <time dateTime={entry.dueAt}>{new Date(entry.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></p> : entry.category === "stock" ? <p>Deadline starts when initial payment is confirmed.</p> : null}
    {entry.note && entry.note !== entry.deferredReason ? <p><strong>Recorded note:</strong> {entry.note}</p> : null}
    {entry.deferredReason ? <p><strong>During-project selection:</strong> {entry.deferredReason}</p> : null}
    {entry.completedAt ? <p>Recorded <time dateTime={entry.completedAt}>{new Date(entry.completedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></p> : null}
    {points.length ? <fieldset disabled={disabled || !entry.availableActions.includes("approve")}><legend>Confirm each approval point</legend>{points.map((point) => <label key={point.id}><input type="checkbox" checked={checked.includes(point.id)} onChange={(event) => setChecked(event.target.checked ? [...checked, point.id] : checked.filter((value) => value !== point.id))} />{point.text}</label>)}</fieldset> : null}
    {entry.availableActions.length ? <><Field id={`${id}-note`} label="Evidence or decision note" required hint="For during-project selection, explain the reason for deferring.">{(props) => <Textarea {...props} value={note} maxLength={2000} disabled={disabled} onChange={(event) => { setNote(event.target.value); setValidation(""); }} />}</Field><div className="design-requirement-actions">{entry.availableActions.map((action) => <Button key={action} variant={action === "approve" || action === "complete" ? "primary" : "secondary"} disabled={disabled} onClick={() => void act(action)}>{actionLabels[action]}</Button>)}</div></> : <p className="design-requirement-readonly">No action is available for your role at this stage.</p>}
    {validation ? <p role="alert">{validation}</p> : null}
  </article>;
}
