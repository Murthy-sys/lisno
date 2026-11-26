import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Radio } from "../../components/ui/Field";
import type { DesignerHandoffView, KeyCollectionScheduleData } from "../../../../shared/projects/designerAssignment";
import { performDesignWorkflowAction, type DesignWorkflowView } from "./projectWorkflowApi";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
import "../designer/designerHandoff.css";
import { collectionCountdown, useServerAdjustedClock } from "./keyCollectionClock";
import { designWorkflowQueryKey } from "./useDesignWorkflowQuery";

const indiaOffsetMs = 330 * 60_000;
const appointmentDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export function indiaDateTimeToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}:00+05:30`);
  if (!Number.isFinite(time) || new Date(time + indiaOffsetMs).toISOString().slice(0, 16) !== value) return null;
  return new Date(time).toISOString();
}


export function DesignerHandoff({ workflow, presentation, refreshing = false, refreshError = false, showTimer = true }: {
  workflow: DesignWorkflowView; presentation: "client" | "designer" | "full"; refreshing?: boolean; refreshError?: boolean; showTimer?: boolean;
}) {
  const handoff = workflow.designerHandoff;
  const now = useServerAdjustedClock(workflow.serverNow, workflow.receivedAt);
  if (!handoff) return presentation === "client" && workflow.estimateApprovalStatus === "approved"
    ? <section className="designer-handoff" aria-label="Designer handoff"><p role="status">Designer assignment details are unavailable. Refresh the project to try again.</p></section> : null;
  if (handoff.state === "awaiting_approval") return null;
  const appointment = handoff.appointment;
  const received = appointment?.receivedAt;
  const complete = handoff.state === "completed" || Boolean(appointment?.completedAt);
  const deadline = appointment ? Date.parse(appointment.deadlineAt) : NaN;
  const remaining = deadline - now;
  return <section className="designer-handoff" aria-label="Designer handoff">
    <h3>{presentation === "client" ? "Your designer" : "Key collection appointment"}</h3>
    {handoff.state === "source_issue" ? <p role="status">Designer assignment details need attention. Refresh the project before scheduling key collection.</p>
      : handoff.state === "awaiting_designer" ? <p>Your estimate is approved. We’ll assign your designer soon.</p>
      : handoff.designer ? <p>{presentation === "client" ? `Your designer, ${handoff.designer.name}, is assigned.` : `Assigned Designer: ${handoff.designer.name}`}
        {presentation === "client" && handoff.state === "awaiting_client_schedule" ? " Please confirm key collection within 48 hours or choose a date and time that works for you." : ""}</p> : <p>Designer assignment details are unavailable.</p>}
    {complete ? <p role="status">Key collection completed.</p>
      : received || handoff.state === "received" ? <p role="status">The Designer has received the keys. {appointment?.handedOverAt ? "" : "Client handover confirmation is still required."}</p>
      : appointment && Number.isFinite(deadline) && Number.isFinite(now) ? <>
        <p>Key collection by <time dateTime={appointment.deadlineAt}>{appointmentDate.format(deadline)}</time> (Asia/Kolkata)</p>
        {showTimer ? <time className="designer-handoff__timer" role="timer" aria-live="off" aria-label={remaining < 0 ? "Key collection overdue" : remaining === 0 ? "Key collection due now" : "Time until key collection"} dateTime={appointment.deadlineAt}>
          {collectionCountdown(deadline, now)}
        </time> : null}
        <p>This appointment deadline continues while kickoff tasks are pending.</p>
      </> : handoff.state === "awaiting_client_schedule" ? <p>The countdown starts when the Client confirms a time.</p>
        : handoff.state === "scheduled" ? <p role="status">The collection deadline is unavailable. Refresh the project before continuing.</p> : null}
    {handoff.blockers.length ? <div><p>Before key collection:</p><ul className="designer-handoff__blockers">{handoff.blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul></div> : null}
    {presentation === "client" && handoff.state === "awaiting_client_schedule" && handoff.canSchedule ? <KeyCollectionSchedule key={workflow.projectId} workflow={workflow} handoff={handoff} now={now} refreshing={refreshing} refreshError={refreshError} /> : null}
  </section>;
}

function KeyCollectionSchedule({ workflow, handoff, now, refreshing, refreshError }: {
  workflow: DesignWorkflowView; handoff: DesignerHandoffView; now: number; refreshing: boolean; refreshError: boolean;
}) {
  const { user, authorization, reviewSession } = useAuth();
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const queryClient = useQueryClient();
  const stage = workflow.projectStages?.find(item => item.type === "key_collection");
  const [source, setSource] = useState({ version: stage?.operational?.version, revision: handoff.assignmentRevision });
  const [mode, setMode] = useState<"within_48_hours" | "chosen_datetime">("within_48_hours");
  const [localDate, setLocalDate] = useState("");
  const [validation, setValidation] = useState("");
  const keys = useRef(new Map<string, string>());
  const permitted = user?.role === "client" && hasFrontendPermission(authorization, "projects.design_workflow.act");
  const stale = source.version !== stage?.operational?.version || source.revision !== handoff.assignmentRevision;
  const mutation = useMutation({
    mutationFn: (data: KeyCollectionScheduleData) => {
      if (!stage || source.version === undefined) throw new Error("Key collection details are unavailable.");
      const signature = JSON.stringify({ data, source });
      const idempotencyKey = keys.current.get(signature) ?? crypto.randomUUID();
      keys.current.set(signature, idempotencyKey);
      return performDesignWorkflowAction({ projectId: workflow.projectId, stageId: stage.id, action: "key_collection_schedule", expectedVersion: source.version, data, idempotencyKey });
    },
    onSuccess: async () => { await refresh(); }
  });
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  if (!permitted) return null;
  if (!stage || source.version === undefined || !source.revision) return <p role="status">Key collection details are unavailable. Refresh the project before confirming a time.</p>;
  return <form aria-label="Schedule key collection" onSubmit={event => {
    event.preventDefault();
    if (mutation.isPending || mutation.isSuccess || stale || refreshing || refreshError || conflict || !source.revision) return;
    const scheduledAt = indiaDateTimeToUtc(localDate);
    if (!Number.isFinite(now) || (mode === "chosen_datetime" && (!scheduledAt || Date.parse(scheduledAt) <= now))) {
      setValidation("Choose a future date and time in Asia/Kolkata."); return;
    }
    setValidation("");
    mutation.mutate(mode === "within_48_hours" ? { mode, expectedAssignmentRevision: source.revision } : { mode, scheduledAt: scheduledAt!, expectedAssignmentRevision: source.revision });
  }}>
    <fieldset disabled={mutation.isPending || mutation.isSuccess}><legend>Choose your key collection time</legend>
      <label className="designer-handoff__option"><Radio name={`${id}-mode`} checked={mode === "within_48_hours"} onChange={() => setMode("within_48_hours")} />Within 48 hours of confirmation</label>
      <label className="designer-handoff__option"><Radio name={`${id}-mode`} checked={mode === "chosen_datetime"} onChange={() => setMode("chosen_datetime")} />Choose date and time</label>
      {mode === "chosen_datetime" ? <Field id={`${id}-date`} label="Key collection date and time (Asia/Kolkata)" hint="India Standard Time, UTC+05:30" error={validation || undefined}>{props => <Input {...props} type="datetime-local" required value={localDate} onChange={event => { setLocalDate(event.target.value); setValidation(""); }} />}</Field> : null}
    </fieldset>
    <p>Internal Kickoff and Client Kickoff must both be completed before the keys can be collected. Confirmed dates cannot be changed here.</p>
    {stale || conflict ? <div role="alert"><p>The project changed. Refresh and review the current assignment before confirming.</p><Button variant="secondary" disabled={refreshing} onClick={async () => {
      await refresh();
      const current = queryClient.getQueryData<DesignWorkflowView>(designWorkflowQueryKey(workflow.projectId, user?.id ?? null, user?.role ?? null, reviewSession?.id));
      if (current?.projectId === workflow.projectId) setSource({ version: current.projectStages?.find(item => item.type === "key_collection")?.operational?.version, revision: current.designerHandoff?.assignmentRevision ?? null });
      mutation.reset(); keys.current.clear();
    }}>Review refreshed schedule</Button></div> : null}
    {mutation.isError && !conflict ? <p role="alert">{mutation.error instanceof Error ? mutation.error.message : "The collection time could not be saved."}</p> : null}
    {refreshError ? <p role="alert">The latest workflow could not be loaded. Refresh before confirming a time.</p> : null}
    {mutation.isSuccess ? <p role="status">Key collection time confirmed.</p> : null}
    <Button type="submit" busy={mutation.isPending} busyLabel="Confirming…" disabled={mutation.isSuccess || stale || conflict || refreshing || refreshError}>
      {mode === "within_48_hours" ? "Confirm 48-hour window" : "Confirm date"}
    </Button>
  </form>;
}
