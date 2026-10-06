import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import "./clientVendorWorkReview.css";

interface Review {
  id: string;
  projectId: string;
  assignmentId: string;
  round: number;
  status: "pending" | "approved" | "changes_requested";
  version: number;
  roomName: string;
  itemName: string;
  scopeType: string | null;
  description: string;
  sectionLabel: string;
  note: string;
  progress: number;
  submittedAt: string;
  imageIds: string[];
  decision: { decision: "approve" | "request_changes"; reason: string | null; decidedAt: string } | null;
}

const keys = {
  reviews: (projectId: string) => ["client", "projects", projectId, "vendor-work-reviews"] as const
};
const PAGE_SIZE = 50;

export function ClientVendorWorkReview({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [viewing, setViewing] = useState<{ assignmentId: string; imageIds: string[]; index: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const reviews = useQuery({
    queryKey: [...keys.reviews(projectId), page],
    queryFn: () => apiClient.get<{ items: Review[]; total: number; pendingTotal: number; limit: number; offset: number }>(`/clients/projects/${encodeURIComponent(projectId)}/vendor-work-reviews?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { showGlobalLoader: false }),
    enabled: Boolean(projectId),
    staleTime: 15_000
  });
  const decision = useMutation({
    mutationFn: ({ review, choice }: { review: Review; choice: "approve" | "request_changes" }) => apiClient.post<Review>(
      `/clients/projects/${encodeURIComponent(projectId)}/vendor-work-reviews/${encodeURIComponent(review.id)}/decision`,
      { expectedVersion: review.version, idempotencyKey: crypto.randomUUID(), decision: choice, reason: choice === "request_changes" ? reason.trim() : null }
    ),
    onSuccess: async (_result, { choice }) => {
      setPage(0);
      setReviewing(null);
      setReason("");
      setFeedback(choice === "approve" ? "Work approved. The project team can see your decision." : "Changes requested. The vendor will receive this section again.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.reviews(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
        queryClient.invalidateQueries({ queryKey: ["vendor-work", "progress", projectId] })
      ]);
    }
  });

  useEffect(() => {
    setPage(0);
  }, [projectId]);

  useEffect(() => {
    if (reviews.data && reviews.data.total <= page * PAGE_SIZE && page > 0) setPage(Math.max(0, Math.ceil(reviews.data.total / PAGE_SIZE) - 1));
  }, [page, reviews.data]);

  useEffect(() => {
    if (!viewing) { setImageUrl(null); setImageError(""); return; }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setImageUrl(null);
    setImageError("");
    const imageId = viewing.imageIds[viewing.index];
    if (imageId) {
      void apiClient.getBlob(`/projects/${encodeURIComponent(projectId)}/vendor-work/${encodeURIComponent(viewing.assignmentId)}/images/${encodeURIComponent(imageId)}`, { signal: controller.signal, showGlobalLoader: false, maxBytes: 12_000_000 })
        .then(({ blob }) => {
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        })
        .catch((error: unknown) => { if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : "Image could not be loaded."); });
    }
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, viewing]);

  if (reviews.isPending) return <section className="client-work-review" aria-label="Work for your review"><p role="status">Loading submitted work…</p></section>;
  if (reviews.isError) return <section className="client-work-review" aria-label="Work for your review"><h2>Work for your review</h2><p role="alert">Submitted work could not be loaded.</p><button type="button" onClick={() => void reviews.refetch()}>Try again</button></section>;
  const items = reviews.data?.items ?? [];
  if (!items.length && !reviews.data?.total) return null;
  const total = reviews.data?.total ?? 0;
  const offset = reviews.data?.offset ?? page * PAGE_SIZE;
  const limit = reviews.data?.limit ?? PAGE_SIZE;
  const pendingTotal = reviews.data?.pendingTotal ?? items.filter(item => item.status === "pending").length;
  return <section className="client-work-review" aria-labelledby="client-work-review-title">
    <div className="client-work-review__heading"><div><p className="client-work-review__eyebrow">On site</p><h2 id="client-work-review-title">Work for your review</h2><p>Review each submitted section and its supporting images before approving it.</p></div><span>{pendingTotal} awaiting you</span></div>
    {feedback ? <p role="status" className="client-work-review__feedback">{feedback}</p> : null}
    {reviews.isFetching && reviews.data ? <p role="status">Refreshing submitted work…</p> : null}
    <div className="client-work-review__list">{items.map(review => <article key={review.id} className="client-work-review__item">
      <div className="client-work-review__item-head"><div><p>{review.roomName} · {review.sectionLabel || review.scopeType?.replaceAll("_", " ") || "Not specified"}</p><h3>{review.itemName}</h3></div><span className={`client-work-review__status client-work-review__status--${review.status}`}>{review.status === "pending" ? "Review requested" : review.status === "approved" ? "Approved" : "Changes requested"}</span></div>
      <p>{review.description}</p>
      <dl><div><dt>Submitted</dt><dd>{new Date(review.submittedAt).toLocaleDateString("en-IN")}</dd></div><div><dt>Round</dt><dd>{review.round}</dd></div><div><dt>Progress</dt><dd>{review.progress}%</dd></div></dl>
      {review.note ? <blockquote>{review.note}</blockquote> : null}
      <div className="client-work-review__actions">
        {review.imageIds.length ? <button type="button" onClick={() => setViewing({ assignmentId: review.assignmentId, imageIds: review.imageIds, index: 0 })}>View images ({review.imageIds.length})</button> : <span>No images supplied for this section</span>}
        {review.status === "pending" ? <><button type="button" disabled={decision.isPending} onClick={() => { setReviewing(review.id); setReason(""); decision.reset(); }}>Request changes</button><button type="button" disabled={decision.isPending} onClick={() => decision.mutate({ review, choice: "approve" })}>Approve section</button></> : null}
      </div>
      {reviewing === review.id ? <div className="client-work-review__change"><label htmlFor={`review-reason-${review.id}`}>Describe the changes needed</label><textarea id={`review-reason-${review.id}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} rows={3} /><div><button type="button" onClick={() => setReviewing(null)}>Cancel</button><button type="button" disabled={!reason.trim() || decision.isPending} onClick={() => decision.mutate({ review, choice: "request_changes" })}>Send changes to vendor</button></div></div> : null}
      {decision.isError && (reviewing === review.id || review.status === "pending") ? <p role="alert">{decision.error instanceof Error ? decision.error.message : "Decision could not be saved."} Refresh this section and try again.</p> : null}
      {review.decision?.reason ? <p className="client-work-review__prior">Your response: {review.decision.reason}</p> : null}
    </article>)}</div>
    {total > limit ? <nav aria-label="Submitted work pages" className="client-work-review__actions"><button type="button" disabled={page === 0} onClick={() => { setReviewing(null); setViewing(null); setPage(current => current - 1); }}>Previous reviews</button><span>Showing {items.length ? offset + 1 : 0}–{Math.min(offset + items.length, total)} of {total}</span><button type="button" disabled={offset + limit >= total} onClick={() => { setReviewing(null); setViewing(null); setPage(current => current + 1); }}>Next reviews</button></nav> : null}
    {viewing ? <div className="client-work-review__lightbox" role="dialog" aria-modal="true" aria-label="Work images"><div><div className="client-work-review__lightbox-head"><strong>Image {viewing.index + 1} of {viewing.imageIds.length}</strong><button type="button" autoFocus onClick={() => setViewing(null)}>Close images</button></div>{imageError ? <p role="alert">{imageError}</p> : imageUrl ? <img src={imageUrl} alt={`Work evidence ${viewing.index + 1}`} /> : <p role="status">Loading image…</p>}<div className="client-work-review__lightbox-actions"><button type="button" disabled={viewing.index === 0} onClick={() => setViewing({ ...viewing, index: viewing.index - 1 })}>Previous</button><button type="button" disabled={viewing.index >= viewing.imageIds.length - 1} onClick={() => setViewing({ ...viewing, index: viewing.index + 1 })}>Next</button></div></div></div> : null}
  </section>;
}
