import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { ROLE_LABELS } from "../../api/authorization-contract";
import type { DesignPlanReviewTask } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, FileInput, Radio, Textarea } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { DesignPlanAttachmentPreview } from "../workflow/DesignPlanAttachmentPreview";
import { clientKeys } from "../client/clientApi";
import { designerKeys } from "../designer/designerApi";
import { estimateDesignKeys } from "../leads/estimateDesignApi";
import { projectFinanceKeys } from "../finance/projectFinanceApi";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import {
  decideDesignPlanReview,
  downloadDesignPlanReviewAttachment,
  downloadDesignPlanReviewProof,
  getDesignPlanReviewTasks,
  projectWorkflowKeys,
  retryDesignPlanReviewEmail
} from "../workflow/projectWorkflowApi";
import "../workflow/projectClientActions.css";

const submittedAt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export function DesignPlanResponseInboxPage() {
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.designReviews("pending"),
    queryFn: () => getDesignPlanReviewTasks("pending")
  });

  if (tasks.isPending) {
    return <PageState state="loading" message="Loading design approvals…" />;
  }
  if (tasks.isError) {
    return (
      <PageState
        state="error"
        message="We couldn't load design approvals."
        action={{ label: "Try again", onAction: () => void tasks.refetch() }}
      />
    );
  }

  return (
    <section className="access-administration" aria-labelledby="design-response-title">
      <PageHeader
        id="design-response-title"
        eyebrow="Client design response"
        title="Design approvals"
        description="Record a Client's approval or requested changes and retain the supplied proof."
        metadata={<StatusBadge tone="warning" label={`${tasks.data.length} pending`} />}
      />
      {!tasks.data.length ? (
        <PageState state="empty" message="No design plans are awaiting a Client response." />
      ) : (
        <div className="design-review-grid">
          {tasks.data.map((task) => <DesignReviewCard task={task} key={task.id} />)}
        </div>
      )}
    </section>
  );
}

export function DesignReviewCard({ task }: { task: DesignPlanReviewTask }) {
  // A newer server version requires a fresh decision and proof selection.
  return <DesignReviewCardContent key={`${task.id}:${task.version}`} task={task} />;
}

function DesignReviewCardContent({ task }: { task: DesignPlanReviewTask }) {
  const client = useQueryClient();
  const { user, authorization } = useAuth();
  const canDecide = task.status === "pending" && task.canDecide === true &&
    (user?.role === "admin" || user?.role === "super_admin") &&
    hasFrontendPermission(authorization, "design.plan_response_tasks.decide");
  const [decision, setDecision] = useState<"approve" | "request_changes">("approve");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const [progress, setProgress] = useState(0);
  const [stale, setStale] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const inFlight = useRef(false);
  const proofRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useMutation({
    mutationFn: () => decideDesignPlanReview({
      roundId: task.id,
      expectedVersion: task.version,
      decision,
      note: note.trim(),
      proof: proof!
    }, setProgress),
    onSuccess: async (updated) => {
      setRecorded(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        client.invalidateQueries({ queryKey: adminProjectKeys.all }),
        client.invalidateQueries({ queryKey: dashboardKeys.all }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.projects }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.bucket(updated.projectId) }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.entries(updated.projectId) }),
        client.invalidateQueries({ queryKey: clientKeys.projects }),
        client.invalidateQueries({ queryKey: clientKeys.latestVersions }),
        client.invalidateQueries({ queryKey: designerKeys.all }),
        client.invalidateQueries({ queryKey: estimateDesignKeys.all }),
        client.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(task.estimateId) }),
        client.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(task.estimateId) })
      ]);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setStale(true);
        await client.invalidateQueries({ queryKey: projectWorkflowKeys.all });
      }
    },
    onSettled: () => { inFlight.current = false; }
  });
  const retryEmail = useMutation({
    mutationFn: () => retryDesignPlanReviewEmail(task.id, task.version),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
      client.invalidateQueries({ queryKey: dashboardKeys.all })
    ]),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: projectWorkflowKeys.all });
      }
    }
  });

  const submit = () => {
    if (inFlight.current || !canDecide || stale || recorded || retryEmail.isPending) return;
    if (!proof) {
      setValidation("Upload proof of the Client's design decision.");
      proofRef.current?.focus();
      return;
    }
    if (!/\.(pdf|jpe?g|png|webp)$/iu.test(proof.name) ||
      (proof.type && !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(proof.type))) {
      setValidation("Choose a PDF, JPG, PNG, or WebP proof file.");
      proofRef.current?.focus();
      return;
    }
    if (decision === "request_changes" && !note.trim()) {
      setValidation("Explain the Client's requested design changes.");
      noteRef.current?.focus();
      return;
    }
    if (note.trim().length > 1000) {
      setValidation("Keep the note within 1000 characters.");
      noteRef.current?.focus();
      return;
    }
    setValidation("");
    setProgress(0);
    inFlight.current = true;
    mutation.mutate();
  };

  const changesRequested = decision === "request_changes";
  const retryable = canDecide && !recorded && !stale &&
    (task.deliveryStatus === "failed" || task.deliveryStatus === "disabled");
  const busy = mutation.isPending || retryEmail.isPending || stale;
  const noteId = `design-review-note-${task.id}`;
  const proofId = `design-review-proof-${task.id}`;

  return (
    <Surface as="article" className="design-review-card">
      <div className="design-review-card__heading">
        <div>
          <p className="eyebrow">Design plan v{task.designPlanVersion}</p>
          <h2>{task.projectName}</h2>
          <p>{task.clientName}</p>
        </div>
        <div className="design-review-card__delivery">
          {task.status !== "pending" ? <StatusBadge
            tone={task.status === "approved" ? "success" : task.status === "changes_requested" ? "warning" : "neutral"}
            label={task.status === "approved" ? "Approved" : task.status === "changes_requested" ? "Changes requested" : "Withdrawn"}
          /> : null}
          <StatusBadge
            tone={task.deliveryStatus === "failed"
              ? "danger"
              : task.deliveryStatus === "disabled"
                ? "warning"
                : task.deliveryStatus === "sent"
                  ? "success"
                  : "info"}
            label={task.deliveryStatus === "sent"
              ? "Email sent"
              : task.deliveryStatus === "failed"
                ? "Email delivery failed"
                : task.deliveryStatus === "disabled"
                  ? "Email unavailable"
                  : task.deliveryStatus === "sending"
                    ? "Email sending"
                    : "Email queued"}
          />
          {retryable ? (
            <Button
              variant="secondary"
              size="compact"
              busy={retryEmail.isPending}
              busyLabel="Retrying email…"
              disabled={mutation.isPending}
              onClick={() => retryEmail.mutate()}
            >
              Retry email
            </Button>
          ) : null}
        </div>
      </div>

      {retryEmail.isError ? (
        <p className="design-review-card__error" role="alert">
          {retryEmail.error instanceof ApiError
            ? retryEmail.error.message
            : "The design-plan email could not be retried."}
        </p>
      ) : null}

      <dl className="design-review-card__meta">
        <div>
          <dt>Submitted</dt>
          <dd>{submittedAt.format(new Date(task.submittedAt))}</dd>
        </div>
        <div>
          <dt>Attachments</dt>
          <dd>
            {task.attachmentNames.length} plan attachment{task.attachmentNames.length === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>

      <ul className="design-review-card__attachments">
        {task.attachmentNames.map((attachmentName, attachmentIndex) => (
          <li key={`${attachmentIndex}-${attachmentName}`}>
            <span>{attachmentName}</span>
            <DesignPlanAttachmentPreview roundId={task.id} attachmentIndex={attachmentIndex} filename={attachmentName} />
            <DownloadButton
              iconOnly
              label={`Download ${attachmentName}`}
              loadingLabel={`Downloading ${attachmentName}…`}
              errorMessage={`${attachmentName} could not be downloaded.`}
              fallbackFilename={attachmentName}
              className="ui-button ui-button--secondary ui-button--compact"
              getFile={() => downloadDesignPlanReviewAttachment(task.id, attachmentIndex)}
            />
          </li>
        ))}
      </ul>

      {task.decision ? <div className="design-review-card__history" aria-label="Decision history">
        <h3>Client decision recorded</h3>
        <dl className="design-review-card__meta">
          <div><dt>Performed by</dt><dd>{task.decision.performedByName ?? "Name unavailable"}</dd></div>
          <div><dt>Role at decision</dt><dd>{task.decision.performedByRole ? ROLE_LABELS[task.decision.performedByRole] : "Role unavailable"}</dd></div>
          <div><dt>Recorded</dt><dd><time dateTime={task.decision.performedAt}>{submittedAt.format(new Date(task.decision.performedAt))} UTC</time></dd></div>
          <div><dt>Decision</dt><dd>{task.decision.action === "approve" ? "Approved" : "Changes requested"}</dd></div>
        </dl>
        {task.decision.source === "admin_proof" && task.decision.onBehalfOfClient ? <p>Recorded on behalf of the Client.</p> : null}
        {task.decision.note ? <p className="design-review-card__history-note">{task.decision.note}</p> : null}
        {task.decision.proof ? <DownloadButton
          label={`Download decision proof: ${task.decision.proof.filename}`}
          loadingLabel="Downloading decision proof…"
          errorMessage="The decision proof could not be downloaded."
          fallbackFilename={task.decision.proof.filename}
          getFile={() => downloadDesignPlanReviewProof(task.id)}
          className="ui-button ui-button--secondary ui-button--compact"
        /> : null}
      </div> : task.status !== "pending" ? <p>Decision details are unavailable for this review.</p> : null}

      {recorded ? <p role="status">Client design response recorded.</p> : canDecide ? <form
        className="design-review-card__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset className="ui-fieldset" disabled={busy}>
          <legend>Client decision</legend>
          <div className="ui-radio-group design-review-card__decision">
            <label className="ui-radio-option">
              <Radio
                name={`decision-${task.id}`}
                checked={!changesRequested}
                onChange={() => setDecision("approve")}
              />
              <span>Approve design</span>
            </label>
            <label className="ui-radio-option">
              <Radio
                name={`decision-${task.id}`}
                checked={changesRequested}
                onChange={() => setDecision("request_changes")}
              />
              <span>Request changes</span>
            </label>
          </div>
        </fieldset>

        <Field
          id={noteId}
          label={changesRequested ? "Required change note" : "Optional note"}
          required={changesRequested}
        >
          {(controlProps) => (
            <Textarea
              {...controlProps}
              ref={noteRef}
              rows={3}
              value={note}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => { setNote(event.target.value); setValidation(""); }}
            />
          )}
        </Field>

        <Field
          id={proofId}
          label="Client decision proof"
          required
          hint="PDF, JPG, PNG, or WebP."
        >
          {(controlProps) => (
            <FileInput
              {...controlProps}
              ref={proofRef}
              aria-label="Client decision proof"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => { setProof(event.target.files?.[0] ?? null); setValidation(""); }}
            />
          )}
        </Field>

        {validation ? (
          <p className="design-review-card__error" role="alert">{validation}</p>
        ) : null}
        {mutation.isError ? (
          <p className="design-review-card__error" role="alert">
            {stale ? "This Client response task changed. Review the refreshed task before deciding."
              : mutation.error instanceof ApiError
              ? mutation.error.message
              : "The design decision could not be recorded."}
          </p>
        ) : null}
        {mutation.isPending ? <ProgressBar value={progress} label="Decision proof upload"
          valueText={progress >= 100 ? "Upload complete. Recording decision…" : `${progress}% uploaded`} /> : null}

        <div className="design-review-card__actions">
          <Button
            type="submit"
            variant={changesRequested ? "primary" : "success"}
            busy={mutation.isPending}
            busyLabel="Recording…"
            disabled={busy}
          >
            {changesRequested ? "Send changes with proof" : "Approve with proof"}
          </Button>
        </div>
      </form> : task.status === "pending" ? <p className="design-review-card__readonly">Awaiting the Client's design response.</p> : null}
    </Surface>
  );
}
