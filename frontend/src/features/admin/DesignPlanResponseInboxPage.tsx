import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { DesignPlanReviewTask } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, FileInput, Radio, Textarea } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { DownloadButton } from "../../components/ui/DownloadButton";
import {
  decideDesignPlanReview,
  downloadDesignPlanReviewAttachment,
  getDesignPlanReviewTasks,
  projectWorkflowKeys,
  retryDesignPlanReviewEmail
} from "../workflow/projectWorkflowApi";

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

function DesignReviewCard({ task }: { task: DesignPlanReviewTask }) {
  const client = useQueryClient();
  const [decision, setDecision] = useState<"approve" | "request_changes">("approve");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: () => decideDesignPlanReview({
      roundId: task.id,
      expectedVersion: task.version,
      decision,
      note,
      proof: proof!
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: projectWorkflowKeys.all })
  });
  const retryEmail = useMutation({
    mutationFn: () => retryDesignPlanReviewEmail(task.id, task.version),
    onSuccess: () => client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: projectWorkflowKeys.all });
      }
    }
  });

  const submit = () => {
    if (!proof) {
      setValidation("Upload proof of the Client's design decision.");
      return;
    }
    if (decision === "request_changes" && !note.trim()) {
      setValidation("Explain the Client's requested design changes.");
      return;
    }
    setValidation("");
    mutation.mutate();
  };

  const changesRequested = decision === "request_changes";
  const retryable = task.status === "pending" &&
    (task.deliveryStatus === "failed" || task.deliveryStatus === "disabled");
  const busy = mutation.isPending || retryEmail.isPending;
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

      <form
        className="design-review-card__form"
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
              rows={3}
              value={note}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
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
              aria-label="Client decision proof"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => setProof(event.target.files?.[0] ?? null)}
            />
          )}
        </Field>

        {validation ? (
          <p className="design-review-card__error" role="alert">{validation}</p>
        ) : null}
        {mutation.isError ? (
          <p className="design-review-card__error" role="alert">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "The design decision could not be recorded."}
          </p>
        ) : null}

        <div className="design-review-card__actions">
          <Button
            type="submit"
            variant={changesRequested ? "primary" : "success"}
            busy={mutation.isPending}
            busyLabel="Recording…"
            disabled={retryEmail.isPending}
          >
            {changesRequested ? "Send changes with proof" : "Approve with proof"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
