import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { ApiError } from "../../api/client";
import type { DesignSectionReviewItem } from "../../api/types";
import { SectionReviewCard } from "../../components/design/SectionReviewCard";
import { Dialog } from "../../components/ui/Dialog";
import { clientKeys, decideDesignSection, getDesignSectionReview } from "./clientApi";

export function DesignSectionReview({ projectId, mode }: { projectId: string; mode: "client" | "read-only" }) {
  const queryClient = useQueryClient();
  const review = useQuery({
    queryKey: clientKeys.designSections(projectId),
    queryFn: () => getDesignSectionReview(projectId),
    enabled: Boolean(projectId)
  });
  const [choice, setChoice] = useState<{ section: DesignSectionReviewItem; decision: "approved" | "rejected" }>();
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const mutation = useMutation({
    mutationFn: ({ section, decision, comment: value }: { section: DesignSectionReviewItem; decision: "approved" | "rejected"; comment?: string }) =>
      decideDesignSection(section.revision.id, section.revision.revisionNumber, decision, value),
    onSuccess: async () => {
      setChoice(undefined);
      setComment("");
      setCommentError("");
      await queryClient.invalidateQueries({ queryKey: clientKeys.designSections(projectId) });
    }
  });

  if (review.isPending) return <section className="design-review"><h2>Design review</h2><p>Loading design sections…</p></section>;
  if (review.isError) return <section className="design-review"><h2>Design review</h2><p role="alert">We couldn't load the design review.</p><button type="button" onClick={() => void review.refetch()}>Try again</button></section>;

  const { progress, sections } = review.data;
  const submitRejection = () => {
    if (!choice) return;
    if (!comment.trim()) {
      setCommentError("Explain what the designer should modify.");
      return;
    }
    setCommentError("");
    mutation.mutate({ section: choice.section, decision: "rejected", comment: comment.trim() });
  };
  return (
    <section className="design-review" aria-labelledby={`design-review-${projectId}`}>
      <header><div><p className="eyebrow">{mode === "client" ? "Client decisions" : "Read-only inspection"}</p><h2 id={`design-review-${projectId}`}>Design review</h2></div></header>
      <div className="design-review__progress" aria-label={`${progress.approved} approved, ${progress.rejected} rejected, ${progress.awaitingReview} awaiting review, ${progress.total} total`}>
        <strong>{progress.approved} approved</strong><span>{progress.rejected} rejected</span><span>{progress.awaitingReview} awaiting review</span><span>{progress.total} total</span>
      </div>
      {sections.length ? <div className="section-review-grid">{sections.map((section) => (
        <SectionReviewCard
          key={section.id}
          section={section}
          mode={mode}
          busy={mutation.isPending && choice?.section.id === section.id}
          onApprove={() => { mutation.reset(); setChoice({ section, decision: "approved" }); }}
          onReject={() => { mutation.reset(); setComment(""); setCommentError(""); setChoice({ section, decision: "rejected" }); }}
        />
      ))}</div> : <p>No submitted design sections are awaiting review.</p>}
      {choice?.decision === "approved" ? (
        <Dialog title={`Approve ${choice.section.label}?`} description="This section revision will be locked after approval." busy={mutation.isPending} onClose={() => setChoice(undefined)}>
          {mutation.isError ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
          <div className="modal__actions">
            <button type="button" onClick={() => mutation.mutate({ section: choice.section, decision: "approved" })} disabled={mutation.isPending}>Confirm approval</button>
            <button type="button" className="secondary-button" onClick={() => setChoice(undefined)} disabled={mutation.isPending}>Cancel</button>
          </div>
        </Dialog>
      ) : null}
      {choice?.decision === "rejected" ? <RejectionDialog
        section={choice.section}
        comment={comment}
        error={commentError}
        requestError={mutation.isError ? errorMessage(mutation.error) : ""}
        busy={mutation.isPending}
        onComment={(value) => { setComment(value); if (value.trim()) setCommentError(""); }}
        onSubmit={submitRejection}
        onClose={() => setChoice(undefined)}
      /> : null}
    </section>
  );
}

function RejectionDialog({ section, comment, error, requestError, busy, onComment, onSubmit, onClose }: {
  section: DesignSectionReviewItem; comment: string; error: string; requestError: string; busy: boolean;
  onComment: (value: string) => void; onSubmit: () => void; onClose: () => void;
}) {
  const errorId = useId();
  return <Dialog title={`Request changes for ${section.label}`} description="Tell the designer exactly what needs modification." busy={busy} onClose={onClose}>
    <div className="form-field">
      <label htmlFor={`reject-${section.id}`}>Modification comment</label>
      <textarea data-dialog-initial-focus id={`reject-${section.id}`} value={comment} onChange={(event) => onComment(event.target.value)} maxLength={1000} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      {error ? <p id={errorId} className="field-error">{error}</p> : null}
    </div>
    {requestError ? <p role="alert">{requestError}</p> : null}
    <div className="modal__actions">
      <button type="button" onClick={onSubmit} disabled={busy}>Send request</button>
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
    </div>
  </Dialog>;
}

function errorMessage(error: Error) {
  return error instanceof ApiError ? error.message : "The decision could not be saved. Please try again.";
}
