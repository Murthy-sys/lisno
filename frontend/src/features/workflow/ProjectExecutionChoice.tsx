import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import {
  isExecutionChoiceView,
  type ExecutionChoiceCommand,
  type ExecutionChoiceOption,
  type ExecutionChoiceOptionId,
  type ExecutionChoicePhase,
  type ExecutionChoiceSelection
} from "../../../../shared/projects/executionChoice";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Radio } from "../../components/ui/Field";
import { saveProjectExecutionChoice, type DesignWorkflowView } from "./projectWorkflowApi";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
import { designWorkflowQueryKey } from "./useDesignWorkflowQuery";
import { projectReadDenied } from "../projects/projectReadQueries";
import "./projectExecutionChoice.css";

interface Props {
  workflow: DesignWorkflowView;
  refreshing?: boolean;
  refreshError?: boolean;
  onRefresh: () => Promise<DesignWorkflowView | null>;
}

const savedDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const unavailable = "Execution choice is unavailable. Refresh the project to load the current options.";

function Sequence({ phases, label }: { phases: readonly ExecutionChoicePhase[]; label: string }) {
  return <ol className="execution-choice__sequence" aria-label={label}>{phases.map(phase => <li key={phase.id}>{phase.label}</li>)}</ol>;
}

/** Remount drafts and pending commands when the project or authenticated session changes. */
export function ProjectExecutionChoice(props: Props) {
  const { user, authorization, reviewSession } = useAuth();
  const queryClient = useQueryClient();
  const permitted = user?.role === "client" && hasFrontendPermission(authorization, "projects.design_workflow.act");
  const suppressWorkflow = async () => {
    const queryKey = designWorkflowQueryKey(props.workflow.projectId, user?.id ?? null, user?.role ?? null, reviewSession?.id);
    // Cancel older reads before clearing their snapshot so an in-flight response cannot restore it.
    await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData<DesignWorkflowView | null>(queryKey, null);
  };
  return <ExecutionChoiceContent key={`${props.workflow.projectId}:${user?.id}:${user?.role}:${reviewSession?.id ?? "none"}`} {...props} permitted={permitted} onAccessDenied={suppressWorkflow} />;
}

function ExecutionChoiceContent({ workflow, refreshing = false, refreshError = false, onRefresh, permitted, onAccessDenied }: Props & { permitted: boolean; onAccessDenied: () => Promise<void> }) {
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const [accessUnverified, setAccessUnverified] = useState(false);
  const source = !accessUnverified && isExecutionChoiceView(workflow.executionChoice) ? workflow.executionChoice : null;
  const [draft, setDraft] = useState<ExecutionChoiceOptionId | null>(null);
  const [confirmation, setConfirmation] = useState<{ option: ExecutionChoiceOption; version: number } | null>(null);
  const [uncertain, setUncertain] = useState<ExecutionChoiceCommand | null>(null);
  const [acknowledged, setAcknowledged] = useState<ExecutionChoiceCommand | null>(null);
  const [canonicalSelection, setCanonicalSelection] = useState<ExecutionChoiceSelection | null>(null);
  const [error, setError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [checking, setChecking] = useState(false);
  const submissionLock = useRef(false);
  const mounted = useRef(true);
  const saveButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutation = useMutation({ mutationFn: (command: ExecutionChoiceCommand) => saveProjectExecutionChoice(workflow.projectId, command), retry: false });
  const selection = accessUnverified ? null : source?.selection ?? canonicalSelection;
  const busy = mutation.isPending || checking;
  const eligible = permitted && source?.status === "available" && source.canSelect && Boolean(source.keyCollectionStageId);
  const blocked = busy || refreshing || refreshError || Boolean(uncertain || acknowledged || selection) || needsReview || !eligible;
  const staleConfirmation = Boolean(confirmation && confirmation.version !== source?.version);

  const readCurrent = async () => {
    setChecking(true);
    try {
      const current = await onRefresh();
      if (!mounted.current) return null;
      if (current?.projectId !== workflow.projectId || !isExecutionChoiceView(current.executionChoice)) return null;
      setAccessUnverified(false);
      if (current.executionChoice.selection) {
        setCanonicalSelection(current.executionChoice.selection);
        setUncertain(null);
        setConfirmation(null);
      }
      return current.executionChoice;
    } catch {
      return null;
    } finally {
      if (mounted.current) setChecking(false);
    }
  };

  const submit = async () => {
    if (submissionLock.current || busy || selection || acknowledged) return;
    if (!uncertain && (blocked || staleConfirmation || !confirmation || !source?.keyCollectionStageId)) return;
    const command: ExecutionChoiceCommand = uncertain ?? {
      action: "execution_path_select", expectedVersion: confirmation!.version, stageId: source!.keyCollectionStageId!,
      idempotencyKey: crypto.randomUUID(),
      data: { optionId: confirmation!.option.id, definitionVersion: confirmation!.option.definitionVersion, acknowledgedIrreversible: true }
    };
    submissionLock.current = true;
    setError("");
    try {
      await mutation.mutateAsync(command);
      if (!mounted.current) return;
      setAcknowledged(command);
      setUncertain(null);
      setConfirmation(null);
      // The response confirms the write but has no saved timestamp. Keep it locked until a canonical read supplies the details.
      await refresh().catch(() => undefined);
      const current = await readCurrent();
      if (mounted.current && !current?.selection) setError("Your choice was saved permanently. Refresh to load the saved details.");
    } catch (cause) {
      if (!mounted.current) return;
      setConfirmation(null);
      const resultUncertain = !(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408;
      if (resultUncertain) {
        setUncertain(command);
        setError("The save result could not be confirmed. Retry the same choice or refresh to check its status before making another selection.");
      } else {
        setUncertain(null);
        setNeedsReview(true);
        setError(cause.status === 409 ? "The project changed. Review the current choice before continuing." : cause.message);
        if (projectReadDenied(cause)) {
          setAccessUnverified(true);
          setDraft(null);
          setAcknowledged(null);
          setCanonicalSelection(null);
          await onAccessDenied();
        }
        const current = await readCurrent();
        if (mounted.current && current) setNeedsReview(false);
      }
    } finally {
      submissionLock.current = false;
    }
  };

  const retryRead = async () => {
    if (busy) return;
    const current = await readCurrent();
    if (!mounted.current) return;
    if (current) {
      setNeedsReview(false);
      if (current.selection) setError("");
      else if (!uncertain && !acknowledged) setError("");
    } else setError("The current choice could not be loaded. Refresh before continuing.");
  };

  return <section className="execution-choice" aria-labelledby={`${id}-title`} ref={section} tabIndex={-1}>
    <div className="execution-choice__intro"><h3 id={`${id}-title`}>Execution choice</h3><p>Choose the planned sequence for your project after key collection.</p></div>
    {selection ? <div className="execution-choice__saved">
      <p role="status"><strong>{selection.optionLabel}</strong> · Saved permanently</p>
      <Sequence phases={selection.phases} label="Planned sequence" />
      <p className="execution-choice__note">Saved <time dateTime={selection.selectedAt}>{savedDate.format(Date.parse(selection.selectedAt))}</time> (Asia/Kolkata). This choice cannot be changed or revoked.</p>
    </div> : acknowledged ? <p role="status">Your execution choice is saved permanently. Loading the saved details.</p>
      : !source ? <p role="status">{unavailable}</p>
        : source.status === "waiting_for_keys" ? <p role="status">Available after you and your Designer confirm key collection.</p>
          : source.status === "unavailable" ? <p role="status">{source.blockingReason || unavailable}</p>
            : !eligible ? <p role="status">{source.blockingReason || "Awaiting Client selection."}</p>
              : <>
                <fieldset className="execution-choice__options" disabled={blocked}>
                  <legend>Select one execution path</legend>
                  {source.options.map(option => <label key={option.id} className="execution-choice__option">
                    <Radio name={`${id}-option`} aria-label={option.label} aria-describedby={`${id}-${option.id}-sequence`} checked={draft === option.id} onChange={() => { setDraft(option.id); setError(""); }} />
                    <span className="execution-choice__option-copy"><strong>{option.label}</strong><span id={`${id}-${option.id}-sequence`}>{option.phases.map(phase => phase.label).join(" → ")}</span></span>
                  </label>)}
                </fieldset>
                <p className="execution-choice__note">Once saved, this choice cannot be changed or revoked.</p>
                <Button ref={saveButton} disabled={blocked || draft === null} onClick={() => {
                  const option = source.options.find(candidate => candidate.id === draft);
                  if (!blocked && option) { setError(""); setConfirmation({ option, version: source.version }); }
                }}>Save execution choice</Button>
              </>}
    {refreshError && source && !selection && !acknowledged ? <p role="alert">The latest workflow could not be loaded. Refresh before saving a choice.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {(uncertain || acknowledged && !selection || needsReview || !source || refreshError) ? <div className="execution-choice__actions">
      {uncertain && !selection ? <Button busy={mutation.isPending} busyLabel="Saving…" disabled={checking || !permitted} onClick={() => void submit()}>Retry saved choice</Button> : null}
      <Button variant="secondary" busy={checking} busyLabel="Refreshing…" disabled={mutation.isPending || refreshing} onClick={() => void retryRead()}>Refresh choice</Button>
    </div> : null}
    {confirmation && !selection && !acknowledged ? <Dialog title="Save execution choice" eyebrow="Project workflow" description="Once saved, this choice cannot be changed or revoked." showCloseButton={false}
      busy={mutation.isPending} onClose={() => { if (!submissionLock.current) setConfirmation(null); }} initialFocusRef={backButton} returnFocusRef={saveButton} fallbackFocusRef={section}>
      <div className="execution-choice__confirmation">
        <strong>{confirmation.option.label}</strong><Sequence phases={confirmation.option.phases} label="Chosen sequence" />
        {staleConfirmation ? <p role="alert">The workflow changed while this confirmation was open. Go back and review the current choice.</p> : null}
        <div className="execution-choice__actions"><Button variant="secondary" ref={backButton} disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Go back</Button>
          <Button busy={mutation.isPending} busyLabel="Saving…" disabled={blocked || staleConfirmation} onClick={() => void submit()}>Save permanently</Button></div>
      </div>
    </Dialog> : null}
  </section>;
}
