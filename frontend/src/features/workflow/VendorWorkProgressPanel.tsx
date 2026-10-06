import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import "./vendorWorkProgress.css";

interface Work {
  id: string;
  projectId: string;
  vendorId: string;
  orderId: string;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: string | null;
  description: string;
  targetDate: string | null;
  status: string;
  progress: number;
  displayProgress: number;
  progressSource: "vendor" | "site_manager";
  note: string;
  imageCount: number;
  imageIds: string[];
  requestedChangeReason: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
}

interface Progress { projectId: string; assignments: Work[]; pendingOwner: "site_manager" | "vendor" | "client" | "super_admin" | "none" }
export const vendorWorkProgressKey = (projectId: string) => ["vendor-work", "progress", projectId] as const;

export function VendorWorkProgressPanel({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const [viewing, setViewing] = useState<{ task: Work; index: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const progress = useQuery({
    queryKey: vendorWorkProgressKey(projectId),
    queryFn: () => apiClient.get<Progress>(`/projects/${encodeURIComponent(projectId)}/vendor-work-progress`, { showGlobalLoader: false }),
    staleTime: 15_000,
    enabled: Boolean(projectId)
  });
  useEffect(() => {
    if (!viewing) { setImageUrl(null); setImageError(""); return; }
    const imageId = viewing.task.imageIds?.[viewing.index];
    if (!imageId) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setImageUrl(null); setImageError("");
    void apiClient.getBlob(`/projects/${encodeURIComponent(projectId)}/vendor-work/${encodeURIComponent(viewing.task.id)}/images/${encodeURIComponent(imageId)}`, { signal: controller.signal, showGlobalLoader: false, maxBytes: 12_000_000 })
      .then(({ blob }) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setImageUrl(objectUrl); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : "Image could not be loaded."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, viewing]);
  if (progress.isPending) return <section className="vendor-progress" aria-label={`${projectName ?? "Project"} vendor progress`}><p role="status">Loading vendor work…</p></section>;
  if (progress.isError) return <section className="vendor-progress" aria-label={`${projectName ?? "Project"} vendor progress`}><p role="alert">Vendor work could not be loaded.</p><button type="button" onClick={() => void progress.refetch()}>Try again</button></section>;
  const tasks = progress.data?.assignments ?? [];
  if (!tasks.length) return null;
  return <section className="vendor-progress" aria-labelledby={`vendor-progress-${projectId}`}>
    <div className="vendor-progress__heading"><div><p>Site execution</p><h2 id={`vendor-progress-${projectId}`}>{projectName ? `${projectName} work sections` : "Work sections"}</h2></div><div><span>{tasks.length} section{tasks.length === 1 ? "" : "s"}</span><button type="button" onClick={() => void progress.refetch()} disabled={progress.isFetching}>Refresh</button></div></div>
    <p className="vendor-progress__owner">Pending with: <strong>{progress.data?.pendingOwner === "super_admin" ? "Super Admin" : progress.data?.pendingOwner === "client" ? "Client" : progress.data?.pendingOwner === "site_manager" ? "Site Manager" : progress.data?.pendingOwner === "vendor" ? "Vendor" : "No current owner"}</strong></p>
    <div className="vendor-progress__list">{tasks.map(task => <article key={task.id} className="vendor-progress__task">
      <div><p>{task.roomName} · {task.sectionLabel}</p><h3>{task.itemName}</h3><span>{task.scopeType?.replaceAll("_", " ") ?? "Not specified"}</span></div>
      <dl><div><dt>Status</dt><dd>{task.status.replaceAll("_", " ")}</dd></div><div><dt>Progress</dt><dd>{task.displayProgress}%{task.progressSource === "site_manager" ? " · Site Manager verified" : ""}</dd></div><div><dt>Target</dt><dd>{task.targetDate ?? "Not specified"}</dd></div><div><dt>Images</dt><dd>{task.imageCount}</dd></div></dl>
      {task.note ? <p className="vendor-progress__note">Vendor update: {task.note}</p> : null}
      {task.requestedChangeReason ? <p className="vendor-progress__change">Client requested: {task.requestedChangeReason}</p> : null}
      {task.imageIds?.length ? <button type="button" onClick={() => setViewing({ task, index: 0 })}>View images ({task.imageIds.length})</button> : null}
    </article>)}</div>
    {viewing ? <div className="vendor-progress__lightbox" role="dialog" aria-modal="true" aria-label="Vendor work images"><div><header><strong>Image {viewing.index + 1} of {viewing.task.imageIds.length}</strong><button type="button" autoFocus onClick={() => setViewing(null)}>Close images</button></header>{imageError ? <p role="alert">{imageError}</p> : imageUrl ? <img src={imageUrl} alt={`Vendor work evidence ${viewing.index + 1}`} /> : <p role="status">Loading image…</p>}<footer><button type="button" disabled={viewing.index === 0} onClick={() => setViewing({ ...viewing, index: viewing.index - 1 })}>Previous</button><button type="button" disabled={viewing.index >= viewing.task.imageIds.length - 1} onClick={() => setViewing({ ...viewing, index: viewing.index + 1 })}>Next</button></footer></div></div> : null}
  </section>;
}
