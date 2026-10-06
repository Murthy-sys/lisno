import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { decideSiteCompletion, getClientSiteCompletion, siteCompletionKeys, type SiteCompletionSection } from "../workflow/siteCompletionApi";
import "./clientSiteCompletion.css";

export function ClientSiteCompletionReview({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: [...siteCompletionKeys.project(projectId), "client"], queryFn: () => getClientSiteCompletion(projectId),
    refetchInterval: 15_000 });
  const [reason, setReason] = useState("");
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [viewing, setViewing] = useState<{ section: SiteCompletionSection; index: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const current = query.data;
  const review = current?.review;
  useEffect(() => {
    if (!viewing) { setImageUrl(null); setImageError(""); return; }
    const imageId = viewing.section.imageIds[viewing.index];
    if (!imageId) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setImageUrl(null); setImageError("");
    void apiClient.getBlob(`/projects/${encodeURIComponent(projectId)}/vendor-work/${encodeURIComponent(viewing.section.assignmentId)}/images/${encodeURIComponent(imageId)}`,
      { signal: controller.signal, showGlobalLoader: false, maxBytes: 12_000_000 })
      .then(({ blob }) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setImageUrl(objectUrl); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : "Image could not be loaded."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, viewing]);
  const decision = useMutation({
    mutationFn: (choice: "approve" | "request_changes") => decideSiteCompletion(projectId, {
      expectedVersion: review!.version, idempotencyKey: crypto.randomUUID(), decision: choice,
      reason: choice === "request_changes" ? reason.trim() : null }),
    onSuccess: async () => { setReason(""); setRequestingChanges(false); await Promise.all([
      client.invalidateQueries({ queryKey: siteCompletionKeys.project(projectId) }),
      client.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
      client.invalidateQueries({ queryKey: ["admin", "project-completion-tasks"] })
    ]); }
  });
  if (query.isPending) return <section aria-label="Project completion review" className="client-site-completion"><p role="status">Loading completion review…</p></section>;
  if (query.isError) return <section aria-label="Project completion review" className="client-site-completion"><p role="alert">Completion review could not be loaded.</p><button type="button" onClick={() => void query.refetch()}>Try again</button></section>;
  if (!review) return null;
  const pending = review.status === "pending" && current?.projectStatus === "active";
  return <section className="client-site-completion" aria-labelledby="client-site-completion-title">
    <header><div><p>Site execution</p><h2 id="client-site-completion-title">Project completion review</h2><span>Submitted by the Site Manager · Round {review.round}</span></div><strong>{review.progress}% complete</strong></header>
    <p>{review.note}</p>
    {review.status !== "pending" ? <p role="status">{current?.projectStatus === "completed" ? "Project completed. No further action is needed." : review.status === "approved" ? "You accepted this completion. Super Admin will close the project." : "You requested changes. The Site Manager will submit an updated completion."}</p> : null}
    <div className="client-site-completion__sections">{review.sections.map(section => <article key={section.assignmentId}>
      <div><small>{section.roomName} · {section.sectionLabel}</small><h3>{section.itemName}</h3><span>{section.scopeType?.replaceAll("_", " ") ?? "Not specified"}</span></div>
      {section.imageIds.length ? <button type="button" onClick={() => setViewing({ section, index: 0 })}>View images ({section.imageIds.length})</button> : <span>No images supplied</span>}
    </article>)}</div>
    {pending ? <div className="client-site-completion__actions"><button type="button" disabled={decision.isPending} onClick={() => decision.mutate("approve")}>Accept completion</button><button type="button" disabled={decision.isPending} onClick={() => setRequestingChanges(true)}>Request changes</button></div> : null}
    {pending && requestingChanges ? <div className="client-site-completion__reason"><label htmlFor={`site-completion-reason-${projectId}`}>Describe the changes needed</label><textarea id={`site-completion-reason-${projectId}`} value={reason} maxLength={2000} rows={3} onChange={event => setReason(event.target.value)} /><div><button type="button" onClick={() => setRequestingChanges(false)}>Cancel</button><button type="button" disabled={!reason.trim() || decision.isPending} onClick={() => decision.mutate("request_changes")}>Send changes to Site Manager</button></div></div> : null}
    {decision.isError ? <p role="alert">The review changed or your decision could not be saved. <button type="button" onClick={() => void query.refetch()}>Refresh and try again</button>.</p> : null}
    {viewing ? <div className="client-site-completion__lightbox" role="dialog" aria-modal="true" aria-label="Completion images"><div><div className="client-site-completion__lightbox-head"><strong>Image {viewing.index + 1} of {viewing.section.imageIds.length}</strong><button type="button" autoFocus onClick={() => setViewing(null)}>Close images</button></div>{imageError ? <p role="alert">{imageError}</p> : imageUrl ? <img src={imageUrl} alt={`Completion evidence ${viewing.index + 1}`} /> : <p role="status">Loading image…</p>}<div className="client-site-completion__lightbox-actions"><button type="button" disabled={viewing.index === 0} onClick={() => setViewing({ ...viewing, index: viewing.index - 1 })}>Previous</button><button type="button" disabled={viewing.index >= viewing.section.imageIds.length - 1} onClick={() => setViewing({ ...viewing, index: viewing.index + 1 })}>Next</button></div></div></div> : null}
  </section>;
}
