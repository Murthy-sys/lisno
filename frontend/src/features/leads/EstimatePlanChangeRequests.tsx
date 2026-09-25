import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { EstimateDesignUpload } from "../../api/types";
import { AnnotationOverlay } from "../../components/design/ImageAnnotationEditor";
import { ProtectedImage } from "../../components/design/ProtectedImage";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import {
  estimateDesignKeys,
  estimatePlanChangeRequestKeys,
  getEstimateDesignWorkspace,
  getEstimatePlanChangeRequest,
  getEstimatePlanChangeRequests,
  replaceEstimateDrawing,
  resolveEstimatePlanPageRequest,
  retryEstimateDesignUpload,
  updateEstimatePlanRequestTargets,
  uploadEstimatePlanRequestReplacement
} from "./estimateDesignApi";

function replacementAttemptKey() {
  return globalThis.crypto?.randomUUID?.() ?? `plan-replacement-${Date.now()}-${Math.random()}`;
}

function latestRequestUpload(uploads: EstimateDesignUpload[], requestId: string) {
  return uploads
    .filter((upload) => upload.requestReplacement?.requestId === requestId)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0];
}

function matchReasonLabel(reason: "normalized_title" | "mapping_tuple" | null) {
  if (reason === "normalized_title") return "Matched by drawing title";
  if (reason === "mapping_tuple") return "Matched by estimate mapping";
  return "Waiting for title matching";
}

export function EstimatePlanChangeRequests({ estimateId }: { estimateId?: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [targetFiles, setTargetFiles] = useState<Record<string, File | undefined>>({});
  const [requestFiles, setRequestFiles] = useState<Record<string, File | undefined>>({});
  const [requestKeys, setRequestKeys] = useState<Record<string, string | undefined>>({});
  const [requestProgress, setRequestProgress] = useState<Record<string, number | undefined>>({});
  const [submittedUploads, setSubmittedUploads] = useState<Record<string, EstimateDesignUpload | undefined>>({});
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [resolutionNote, setResolutionNote] = useState("");
  const [pageSource, setPageSource] = useState<string>();
  const reconciledTerminalUploads = useRef(new Set<string>());

  const queue = useQuery({
    queryKey: estimatePlanChangeRequestKeys.queue(estimateId),
    queryFn: () => getEstimatePlanChangeRequests({ estimateId, status: "open" })
  });
  const detail = useQuery({
    queryKey: estimatePlanChangeRequestKeys.detail(selectedId ?? ""),
    queryFn: () => getEstimatePlanChangeRequest(selectedId!),
    enabled: Boolean(selectedId)
  });
  const activeEstimateId = estimateId ?? queue.data?.find((request) => request.id === selectedId)?.estimateId;
  const workspace = useQuery({
    queryKey: estimateDesignKeys.workspace(activeEstimateId ?? ""),
    queryFn: () => getEstimateDesignWorkspace(activeEstimateId!),
    enabled: Boolean(activeEstimateId),
    refetchInterval: (query) => query.state.data?.uploads.some((upload) =>
      upload.purpose === "plan_request_replacement" &&
      (upload.extractionStatus === "queued" || upload.extractionStatus === "processing")
    ) ? 1_000 : false
  });

  async function refresh(requestId = selectedId) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: estimatePlanChangeRequestKeys.all }),
      requestId
        ? queryClient.invalidateQueries({ queryKey: estimatePlanChangeRequestKeys.detail(requestId) })
        : Promise.resolve(),
      activeEstimateId
        ? queryClient.invalidateQueries({ queryKey: estimateDesignKeys.workspace(activeEstimateId) })
        : Promise.resolve(),
      activeEstimateId
        ? queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(activeEstimateId) })
        : Promise.resolve(),
      activeEstimateId
        ? queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(activeEstimateId) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all })
    ]);
  }

  const selectedUpload = selectedId
    ? latestRequestUpload(workspace.data?.uploads ?? [], selectedId) ?? submittedUploads[selectedId]
    : undefined;

  useEffect(() => {
    if (
      !selectedUpload ||
      selectedUpload.extractionStatus === "queued" ||
      selectedUpload.extractionStatus === "processing" ||
      reconciledTerminalUploads.current.has(selectedUpload.id)
    ) return;
    reconciledTerminalUploads.current.add(selectedUpload.id);
    void refresh(selectedUpload.requestReplacement?.requestId ?? selectedId);
  }, [selectedId, selectedUpload?.extractionStatus, selectedUpload?.id]);

  const uploadRequest = useMutation({
    mutationFn: ({ requestId, version, file, idempotencyKey }: {
      requestId: string;
      version: number;
      file: File;
      idempotencyKey: string;
    }) => uploadEstimatePlanRequestReplacement(requestId, {
      version,
      file,
      idempotencyKey,
      onProgress: (percent) => setRequestProgress((current) => ({ ...current, [requestId]: percent }))
    }),
    onSuccess: async (upload, input) => {
      setSubmittedUploads((current) => ({ ...current, [input.requestId]: upload }));
      setRequestFiles((current) => ({ ...current, [input.requestId]: undefined }));
      setRequestKeys((current) => ({ ...current, [input.requestId]: undefined }));
      await refresh(input.requestId);
    },
    onSettled: (_data, _error, input) => {
      if (input) setRequestProgress((current) => ({ ...current, [input.requestId]: undefined }));
    }
  });
  const retryRequest = useMutation({
    mutationFn: retryEstimateDesignUpload,
    onSuccess: (upload) => {
      const requestId = upload.requestReplacement?.requestId;
      if (requestId) setSubmittedUploads((current) => ({ ...current, [requestId]: upload }));
      return refresh(requestId);
    }
  });
  const replaceTarget = useMutation({
    mutationFn: ({ drawingId, version, file }: { drawingId: string; version: number; file: File }) =>
      replaceEstimateDrawing(drawingId, version, file),
    onSuccess: () => refresh()
  });
  const link = useMutation({
    mutationFn: () => updateEstimatePlanRequestTargets(selectedId!, {
      version: detail.data!.version,
      targetDrawingIds: selectedTargets
    }),
    onSuccess: () => refresh()
  });
  const resolve = useMutation({
    mutationFn: () => resolveEstimatePlanPageRequest(selectedId!, {
      version: detail.data!.version,
      note: resolutionNote
    }),
    onSuccess: async () => {
      setSelectedId(undefined);
      await refresh();
    }
  });

  if (queue.isPending) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p role="status">Loading client requests…</p></section>;
  if (queue.isError) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p role="alert">Plan requests could not be loaded.</p><Button variant="secondary" onClick={() => void queue.refetch()}>Try again</Button></section>;
  if (!queue.data.length) return <section className="plan-request-workspace"><h2>Plan change requests</h2><p className="inline-empty">No open plan requests.</p></section>;

  const uploadIsPending = selectedUpload?.extractionStatus === "queued" || selectedUpload?.extractionStatus === "processing";
  const uploadFailed = selectedUpload?.extractionStatus === "processing_failed";
  const uploadCompleted = Boolean(selectedUpload && !uploadIsPending && !uploadFailed);
  const completedMatches = selectedUpload?.requestReplacement?.matches.filter((match) => match.resultRevisionId) ?? [];

  return (
    <section className="plan-request-workspace" aria-labelledby="plan-requests-title">
      <header><p className="eyebrow">Client design feedback</p><h2 id="plan-requests-title">Plan change requests</h2></header>
      <div className="plan-request-workspace__layout">
        <div className="plan-request-workspace__queue">
          {queue.data.map((request) => (
            <button type="button" aria-pressed={selectedId === request.id} onClick={() => {
              setSelectedId(request.id);
              setSelectedTargets([]);
              setPageSource(undefined);
              uploadRequest.reset();
            }} key={request.id}>
              <strong>{request.summary}</strong><small>Page request · {request.targetCount ? `${request.targetCount} drawing target${request.targetCount === 1 ? "" : "s"}` : "Unassigned"}</small>
            </button>
          ))}
        </div>
        {selectedId ? (
          <article className="plan-request-workspace__detail" aria-label="Plan request detail">
            {detail.isPending ? <p role="status">Loading request detail…</p> : null}
            {detail.isError ? <p role="alert">Request detail changed. Refresh and try again.</p> : null}
            {detail.data ? (
              detail.data.status === "withdrawn" ? (
                <p role="status">This change request was withdrawn because its design upload was deleted.</p>
              ) : <>
                <div className="plan-request-workspace__page">
                  <ProtectedImage source={detail.data.currentImageUrl} alt="Current full design page" onSourceChange={setPageSource} className={pageSource ? "sr-only" : undefined} />
                  {pageSource ? <AnnotationOverlay imageSource={pageSource} imageWidth={detail.data.annotations.imageWidth} imageHeight={detail.data.annotations.imageHeight} value={detail.data.annotations} /> : null}
                  <p>{detail.data.summary}</p>
                </div>

                {!detail.data.unassigned && detail.data.drawingTargets.some((target) => target.status === "open") ? (
                  <section className="plan-request-workspace__replacement" aria-labelledby={`request-replacement-${detail.data.id}`}>
                    <div>
                      <p className="eyebrow">Primary action</p>
                      <h3 id={`request-replacement-${detail.data.id}`}>Upload the revised file</h3>
                      <p>Upload the revised page or full PDF. Lisno matches only the requested drawing titles, replaces those drawings, and ignores unrelated pages.</p>
                    </div>
                    {!selectedUpload ? (
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        const file = requestFiles[detail.data.id];
                        if (!file || uploadRequest.isPending) return;
                        const idempotencyKey = requestKeys[detail.data.id] ?? replacementAttemptKey();
                        setRequestKeys((current) => ({ ...current, [detail.data.id]: idempotencyKey }));
                        setRequestProgress((current) => ({ ...current, [detail.data.id]: 0 }));
                        uploadRequest.mutate({ requestId: detail.data.id, version: detail.data.version, file, idempotencyKey });
                      }}>
                        <label>
                          Revised file for this request
                          <input
                            type="file"
                            accept="image/*,.pdf,.heic,.heif"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              setRequestFiles((current) => ({ ...current, [detail.data.id]: file }));
                              setRequestKeys((current) => ({ ...current, [detail.data.id]: file ? replacementAttemptKey() : undefined }));
                              uploadRequest.reset();
                            }}
                          />
                        </label>
                        {requestFiles[detail.data.id] ? <small>{requestFiles[detail.data.id]!.name}</small> : null}
                        <Button
                          type="submit"
                          busy={uploadRequest.isPending && uploadRequest.variables?.requestId === detail.data.id}
                          busyLabel="Uploading revised file…"
                          disabled={!requestFiles[detail.data.id]}
                        >
                          Upload requested page revisions
                        </Button>
                        {requestProgress[detail.data.id] !== undefined ? <ProgressBar value={requestProgress[detail.data.id]} label="Uploading revised request file" /> : null}
                      </form>
                    ) : null}
                    {uploadRequest.isError && uploadRequest.variables?.requestId === detail.data.id ? (
                      <div className="plan-request-workspace__upload-error" role="alert"><strong>The revised file was not uploaded.</strong><span>Your selected file is still available. Try the upload again.</span></div>
                    ) : null}
                    {uploadIsPending ? (
                      <div className="plan-request-workspace__upload-status" role="status" aria-live="polite">
                        <ProgressBar label="Matching requested drawing titles" />
                        <div><strong>{selectedUpload!.originalFilename}</strong><span>OCR is matching the requested pages. Unrelated pages will not be added.</span></div>
                      </div>
                    ) : null}
                    {uploadFailed ? (
                      <div className="plan-request-workspace__upload-error" role="alert">
                        <strong>Requested pages were not replaced.</strong>
                        <span>{selectedUpload!.failureMessage ?? "Lisno could not match every requested drawing. Review the file and retry extraction."}</span>
                        {selectedUpload!.canRetry ? <Button variant="secondary" busy={retryRequest.isPending} busyLabel="Retrying extraction…" onClick={() => retryRequest.mutate(selectedUpload!.id)}>Retry requested-page extraction</Button> : null}
                      </div>
                    ) : null}
                    {uploadCompleted && selectedUpload?.requestReplacement ? (
                      <div className="plan-request-workspace__upload-result" role="status" aria-live="polite">
                        <strong>{completedMatches.length} of {selectedUpload.requestReplacement.targetCount} requested drawing{selectedUpload.requestReplacement.targetCount === 1 ? "" : "s"} matched</strong>
                        {completedMatches.length ? <ul aria-label="Matched requested drawings">{completedMatches.map((match) => (
                          <li key={match.drawingId}><span>{match.detectedTitle}</span><small>{matchReasonLabel(match.matchReason)} · PDF page {match.pageNumber}</small></li>
                        ))}</ul> : null}
                        {selectedUpload.requestReplacement.ignoredPageCount ? (
                          <p>Ignored {selectedUpload.requestReplacement.ignoredPageCount} unrelated page{selectedUpload.requestReplacement.ignoredPageCount === 1 ? "" : "s"}{selectedUpload.requestReplacement.ignoredPageNumbers.length ? ` (${selectedUpload.requestReplacement.ignoredPageNumbers.join(", ")})` : ""}. No new design pages were added.</p>
                        ) : <p>No unrelated pages were added.</p>}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="plan-request-workspace__targets" aria-label="Requested drawing targets">
                  {detail.data.drawingTargets.map((target) => (
                    <section className="plan-request-workspace__target" aria-label={`${target.title} target`} key={target.drawingId}>
                      <div><strong>{target.title}</strong><small>{target.status.replaceAll("_", " ")}</small></div>
                      {target.status === "open" ? (
                        <details>
                          <summary>Replace only this drawing</summary>
                          <p>Use this fallback only when you have a separate file for this one drawing.</p>
                          <label>Replacement for {target.title}<input type="file" accept="image/*,.pdf,.heic,.heif" onChange={(event) => setTargetFiles((current) => ({ ...current, [target.drawingId]: event.target.files?.[0] }))} /></label>
                          <Button variant="secondary" disabled={!targetFiles[target.drawingId] || replaceTarget.isPending || uploadIsPending} busy={replaceTarget.isPending && replaceTarget.variables?.drawingId === target.drawingId} busyLabel="Uploading replacement…" onClick={() => replaceTarget.mutate({ drawingId: target.drawingId, version: target.latestRevisionNumber, file: targetFiles[target.drawingId]! })}>Upload only {target.title}</Button>
                        </details>
                      ) : target.status === "withdrawn" ? (
                        <p>This drawing was deleted. Its feedback is retained for reference.</p>
                      ) : <p>Replacement submitted for client review.</p>}
                    </section>
                  ))}
                </div>
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
                {replaceTarget.isError || link.isError || resolve.isError || retryRequest.isError ? <p role="alert">The request changed or the action failed. Refresh and try again.</p> : null}
              </>
            ) : null}
          </article>
        ) : <p className="inline-empty">Select a request to review its page and drawing targets.</p>}
      </div>
    </section>
  );
}
