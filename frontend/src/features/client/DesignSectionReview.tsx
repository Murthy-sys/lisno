import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Image, X } from "lucide-react";

import { ApiError } from "../../api/client";
import type { DesignSectionReviewItem } from "../../api/types";
import { ProtectedImage } from "../../components/design/ProtectedImage";
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
  const [sourceImageUrl, setSourceImageUrl] = useState<string>();
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>();
  const sections = review.data?.sections ?? [];
  const preferredSection =
    sections.find((section) => section.id === activeSectionId) ??
    sections.find((section) => section.revision.reviewStatus === "submitted") ??
    sections[0];
  const activeIndex = preferredSection
    ? sections.findIndex((section) => section.id === preferredSection.id)
    : -1;

  useEffect(() => {
    if (activeSectionId !== preferredSection?.id) setActiveSectionId(preferredSection?.id);
  }, [activeSectionId, preferredSection?.id]);

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

  const { progress } = review.data;
  const projectSource = sections.reduce<DesignSectionReviewItem | undefined>((current, section) => {
    if (!section.sourcePageUrl || (current && current.versionNumber >= section.versionNumber)) return current;
    return section;
  }, undefined);
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
      <header>
        <div><p className="eyebrow">{mode === "client" ? "Client decisions" : "Read-only inspection"}</p><h2 id={`design-review-${projectId}`}>Design review</h2></div>
        {projectSource ? <button
          type="button"
          className="design-review__source-trigger"
          aria-label="View source image"
          disabled={!sourceImageUrl}
          onClick={() => setSourcePreviewOpen(true)}
        >
          <ProtectedImage
            source={projectSource.sourcePageUrl}
            alt=""
            className="design-review__source-thumbnail"
            onSourceChange={setSourceImageUrl}
          />
          <span><Image aria-hidden="true" size={18} />View source image</span>
        </button> : null}
      </header>
      <div className="design-review__progress" role="group" aria-label={`${progress.approved} approved, ${progress.rejected} rejected, ${progress.awaitingReview} awaiting review, ${progress.total} total`}>
        <div className="design-review__stat design-review__stat--approved"><strong>{progress.approved}</strong><span>Approved</span></div>
        <div className="design-review__stat design-review__stat--rejected"><strong>{progress.rejected}</strong><span>Rejected</span></div>
        <div className="design-review__stat design-review__stat--awaiting"><strong>{progress.awaitingReview}</strong><span>Awaiting review</span></div>
        <div className="design-review__stat design-review__stat--total"><strong>{progress.total}</strong><span>Total</span></div>
      </div>
      {preferredSection ? (
        <SectionReviewCard
          section={preferredSection}
          mode={mode}
          busy={mutation.isPending && choice?.section.id === preferredSection.id}
          position={activeIndex + 1}
          total={sections.length}
          previousLabel={activeIndex > 0 ? sections[activeIndex - 1]?.label : undefined}
          nextLabel={activeIndex < sections.length - 1 ? sections[activeIndex + 1]?.label : undefined}
          onPrevious={() => setActiveSectionId(sections[activeIndex - 1]?.id)}
          onNext={() => setActiveSectionId(sections[activeIndex + 1]?.id)}
          onApprove={() => { mutation.reset(); setChoice({ section: preferredSection, decision: "approved" }); }}
          onReject={() => { mutation.reset(); setComment(""); setCommentError(""); setChoice({ section: preferredSection, decision: "rejected" }); }}
        />
      ) : <p>No submitted design sections are awaiting review.</p>}
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
      {sourcePreviewOpen && sourceImageUrl ? <Dialog title="Project source image" eyebrow="Project source" onClose={() => setSourcePreviewOpen(false)}>
        <div className="design-review__source-modal">
          <img className="design-review__source-modal-image" src={sourceImageUrl} alt="Project source image" />
          <div className="design-review__source-modal-actions">
            <button type="button" className="button button--close" onClick={() => setSourcePreviewOpen(false)}>
              <X aria-hidden="true" size={18} />
              Close preview
            </button>
          </div>
        </div>
      </Dialog> : null}
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
