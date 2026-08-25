import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { DesignPlanReviewTask } from "../../api/types";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  decideDesignPlanReview,
  getDesignPlanReviewTasks,
  projectWorkflowKeys
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
        <div className="project-grid">
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

  return (
    <Surface as="article" className="project-card">
      <div className="project-card__heading">
        <div>
          <p className="eyebrow">Design plan v{task.designPlanVersion}</p>
          <h2>{task.projectName}</h2>
          <p>{task.clientName}</p>
        </div>
        <StatusBadge
          tone={task.deliveryStatus === "failed" ? "danger" : "info"}
          label={task.deliveryStatus === "sent" ? "Email sent" : task.deliveryStatus.replaceAll("_", " ")}
        />
      </div>
      <p>Submitted {submittedAt.format(new Date(task.submittedAt))}</p>
      <p>{task.attachmentNames.length} plan attachment{task.attachmentNames.length === 1 ? "" : "s"}: {task.attachmentNames.join(", ")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={mutation.isPending}>
          <legend>Client decision</legend>
          <label><input type="radio" name={`decision-${task.id}`} checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve design</label>
          <label><input type="radio" name={`decision-${task.id}`} checked={decision === "request_changes"} onChange={() => setDecision("request_changes")} /> Request changes</label>
        </fieldset>
        <label>
          {decision === "request_changes" ? "Required change note" : "Optional note"}
          <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label>
          Client decision proof
          <input
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setProof(event.target.files?.[0] ?? null)}
          />
        </label>
        {validation ? <p role="alert">{validation}</p> : null}
        {mutation.isError ? (
          <p role="alert">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "The design decision could not be recorded."}
          </p>
        ) : null}
        <button type="submit" className="button button--primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Recording…" : decision === "approve" ? "Approve with proof" : "Send changes with proof"}
        </button>
      </form>
    </Surface>
  );
}
