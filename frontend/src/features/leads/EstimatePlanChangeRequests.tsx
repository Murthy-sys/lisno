import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ProtectedImage } from "../../components/design/ProtectedImage";
import { AnnotationOverlay } from "../../components/design/ImageAnnotationEditor";
import {
  getEstimatePlanChangeRequest,
  getEstimatePlanChangeRequests,
  replaceEstimateDrawing,
  resolveEstimatePlanPageRequest,
  updateEstimatePlanRequestTargets
} from "./estimateDesignApi";

const keys = {
  queue: (estimateId?: string) => ["estimate-plan-change-requests", estimateId ?? "assigned"] as const,
  detail: (requestId: string) => ["estimate-plan-change-request", requestId] as const
};

export function EstimatePlanChangeRequests({ estimateId }: { estimateId?: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [resolutionNote, setResolutionNote] = useState("");
  const [pageSource, setPageSource] = useState<string>();
  const queue = useQuery({ queryKey: keys.queue(estimateId), queryFn: () => getEstimatePlanChangeRequests({ estimateId, status: "open" }) });
  const detail = useQuery({ queryKey: keys.detail(selectedId ?? ""), queryFn: () => getEstimatePlanChangeRequest(selectedId!), enabled: Boolean(selectedId) });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.queue(estimateId) }),
      selectedId ? queryClient.invalidateQueries({ queryKey: keys.detail(selectedId) }) : Promise.resolve()
    ]);
  }

  const replace = useMutation({
    mutationFn: ({ drawingId, version, file }: { drawingId: string; version: number; file: File }) => replaceEstimateDrawing(drawingId, version, file),
    onSuccess: refresh
  });
  const link = useMutation({
    mutationFn: () => updateEstimatePlanRequestTargets(selectedId!, { version: detail.data!.version, targetDrawingIds: selectedTargets }),
    onSuccess: refresh
  });
  const resolve = useMutation({
    mutationFn: () => resolveEstimatePlanPageRequest(selectedId!, { version: detail.data!.version, note: resolutionNote }),
    onSuccess: async () => { setSelectedId(undefined); await refresh(); }
  });

  if (queue.isPending) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p role="status">Loading client requests…</p></section>;
  if (queue.isError) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p role="alert">Plan requests could not be loaded.</p></section>;
  if (!queue.data.length) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p className="inline-empty">No open plan requests.</p></section>;

  return (
    <section className="plan-request-workspace" aria-labelledby="plan-requests-title">
      <header><p className="eyebrow">Client design feedback</p><h2 id="plan-requests-title">Plan change requests</h2></header>
      <div className="plan-request-workspace__layout">
        <div className="plan-request-workspace__queue">
          {queue.data.map((request) => (
            <button type="button" aria-pressed={selectedId === request.id} onClick={() => { setSelectedId(request.id); setSelectedTargets([]); }} key={request.id}>
              <strong>{request.summary}</strong><small>Page request · {request.targetCount ? `${request.targetCount} drawing target${request.targetCount === 1 ? "" : "s"}` : "Unassigned"}</small>
            </button>
          ))}
        </div>
        {selectedId ? (
          <article className="plan-request-workspace__detail" aria-label="Plan request detail">
            {detail.isPending ? <p role="status">Loading request detail…</p> : null}
            {detail.isError ? <p role="alert">Request detail changed. Refresh and try again.</p> : null}
            {detail.data ? (
              <>
                <div className="plan-request-workspace__page">
                  <ProtectedImage source={detail.data.currentImageUrl} alt="Current full design page" onSourceChange={setPageSource} className={pageSource ? "sr-only" : undefined} />
                  {pageSource ? <AnnotationOverlay imageSource={pageSource} imageWidth={detail.data.annotations.imageWidth} imageHeight={detail.data.annotations.imageHeight} value={detail.data.annotations} /> : null}
                  <p>{detail.data.summary}</p>
                </div>
                {detail.data.drawingTargets.map((target) => (
                  <section className="plan-request-workspace__target" aria-label={`${target.title} target`} key={target.drawingId}>
                    <div><strong>{target.title}</strong><small>{target.status.replaceAll("_", " ")}</small></div>
                    {target.status === "open" ? (
                      <>
                        <label>Replacement for {target.title}<input type="file" accept="image/*,.pdf,.heic,.heif" onChange={(event) => setFiles({ ...files, [target.drawingId]: event.target.files?.[0] })} /></label>
                        <button type="button" className="button button--primary" disabled={!files[target.drawingId] || replace.isPending} onClick={() => replace.mutate({ drawingId: target.drawingId, version: target.latestRevisionNumber, file: files[target.drawingId]! })}>Upload {target.title} replacement</button>
                      </>
                    ) : <p>Replacement submitted for client review.</p>}
                  </section>
                ))}
                {detail.data.unassigned ? (
                  <section className="plan-request-workspace__unassigned">
                    <h3>Map page feedback</h3>
                    {detail.data.drawingCandidates.map((candidate) => (
                      <label key={candidate.drawingId}><input type="checkbox" checked={selectedTargets.includes(candidate.drawingId)} onChange={(event) => setSelectedTargets(event.target.checked ? [...selectedTargets, candidate.drawingId] : selectedTargets.filter((id) => id !== candidate.drawingId))} />{candidate.title}</label>
                    ))}
                    <button type="button" disabled={!selectedTargets.length || link.isPending} onClick={() => link.mutate()}>Link selected drawings</button>
                    <label>Page-only resolution note<textarea value={resolutionNote} maxLength={1000} onChange={(event) => setResolutionNote(event.target.value)} /></label>
                    <button type="button" disabled={!resolutionNote.trim() || resolve.isPending} onClick={() => resolve.mutate()}>Resolve page-only feedback</button>
                  </section>
                ) : null}
                {replace.isError || link.isError || resolve.isError ? <p role="alert">The request changed or the action failed. Refresh and try again.</p> : null}
              </>
            ) : null}
          </article>
        ) : <p className="inline-empty">Select a request to review its page and drawing targets.</p>}
      </div>
    </section>
  );
}
