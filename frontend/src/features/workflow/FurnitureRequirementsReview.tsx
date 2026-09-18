import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { WorkflowMediaList } from "./WorkflowMediaList";
import { formatEvidenceSize } from "./measurementMedia";
import { downloadWorkflowActionMedia, downloadWorkflowActionProof, type DesignStageOperational, type FurnitureReviewEvidence } from "./projectWorkflowApi";
import "./furnitureRequirementsReview.css";
import { furnitureRoomStatusLabel } from "./projectWorkflowSelectors";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const canPreview = (mimeType: string) => mimeType === "application/pdf" || imageTypes.has(mimeType) || videoTypes.has(mimeType);
const evidenceKey = (file: FurnitureReviewEvidence) => `${file.eventId}:${file.mediaId ?? "proof"}`;
const sourceLabel = (file: FurnitureReviewEvidence) => file.source === "site_measurement" ? "Site measurement" : file.source === "furniture_dimensions" ? "Furniture dimensions" : "Furniture requirements";
const getEvidence = (projectId: string, file: FurnitureReviewEvidence, signal?: AbortSignal) => file.mediaId
  ? downloadWorkflowActionMedia(projectId, file.eventId, file.mediaId, signal)
  : downloadWorkflowActionProof(projectId, file.eventId, signal);

/** The parent keys the review by project, stage and workflow version to release stale previews. */
export function FurnitureRequirementsReview({ projectId, operational }: { projectId: string; operational: DesignStageOperational }) {
  const id = useId();
  const [selected, setSelected] = useState<FurnitureReviewEvidence>();
  const [downloads, setDownloads] = useState<Set<string>>(() => new Set());
  const files = useMemo(() => [...(operational.furniture?.evidence ?? [])].sort((a, b) => Number(b.source === "furniture_dimensions") - Number(a.source === "furniture_dimensions")), [operational.furniture?.evidence]);
  const selectionIsCurrent = selected && files.some((file) => evidenceKey(file) === evidenceKey(selected)
    && file.filename === selected.filename && file.mimeType === selected.mimeType && file.byteSize === selected.byteSize && file.source === selected.source);
  useEffect(() => { if (selected && !selectionIsCurrent) setSelected(undefined); }, [selected, selectionIsCurrent]);
  const rooms = operational.rooms ?? [];
  const noFurniture = operational.furniture?.notApplicable || operational.rooms?.length === 0;
  const awaitingAcceptance = operational.furniture?.phase === "awaiting_client_acceptance";
  const hasDimensions = rooms.some((room) => room.dimensions);
  const combined = Boolean(operational.furniture?.requirementsSubmissionEventId);

  return <section className="furniture-review" aria-labelledby={`${id}-heading`}>
    <div className="furniture-review__heading">
      <h5 id={`${id}-heading`}>{awaitingAcceptance ? combined ? "Review furniture requirements and dimensions" : "Review furniture requirements" : hasDimensions ? "Submitted furniture dimensions" : "Furniture requirements"}</h5>
      {awaitingAcceptance ? <p>{combined ? "Review each room’s dimensions and the supporting document. Approval accepts the room requirements and measurements together." : "Review the room requirements and uploaded files before accepting."}</p> : null}
      {hasDimensions && !awaitingAcceptance && operational.furniture?.phase !== "completed" ? <p>Review the latest measurements and supporting document. Required rooms can proceed after Client approval.</p> : null}
    </div>
    {operational.furniture?.scopeReturn ? <div className="furniture-review__feedback" role="note"><strong>Client requested changes to the requirements</strong><p>{operational.furniture.scopeReturn.reason}</p></div> : null}
    {noFurniture ? <p>No existing furniture dimensions are needed.</p> : rooms.length ? <ul className="furniture-review__rooms" aria-label="Saved room requirements">
      {rooms.map((room) => <li key={room.id}><span>{room.name}</span><span>{furnitureRoomStatusLabel(room)}</span></li>)}
    </ul> : <p>Furniture requirements have not been saved yet.</p>}
    {rooms.filter((room) => room.dimensions).map((room) => {
      const dimensionItems = room.dimensions!.items.filter((item) => item.measurementType !== "count");
      const pointItems = room.dimensions!.items.filter((item) => item.measurementType === "count");
      return <section className="furniture-review__dimensions" key={room.id} aria-label={`${room.name} submitted dimensions`}>
      <div className="furniture-review__dimension-heading"><h6>{room.name}</h6><span>Revision {room.dimensions!.revision} · {furnitureRoomStatusLabel(room)}</span></div>
      {room.dimensions!.returnReason ? <div className="furniture-review__feedback" role="note"><strong>Client requested changes</strong><p>{room.dimensions!.returnReason}</p></div> : null}
      {dimensionItems.length ? <div className="furniture-review__table-scroll" role="region" aria-label={`${room.name} measurements`} tabIndex={0}>
        <table><caption className="sr-only">Furniture measurements for {room.name}</caption><thead><tr><th scope="col">Furniture item</th><th scope="col">Length</th><th scope="col">Width</th><th scope="col">Height</th><th scope="col">Unit</th></tr></thead>
          <tbody>{dimensionItems.map((item) => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.length}</td><td>{item.width}</td><td>{item.height}</td><td title={item.uomName}>{item.unit}</td></tr>)}</tbody>
        </table>
      </div> : null}
      {pointItems.length ? <div className="furniture-review__table-scroll" role="region" aria-label={`${room.name} point counts`} tabIndex={0}>
        <table><caption className="sr-only">Point counts for {room.name}</caption><thead><tr><th scope="col">Item</th><th scope="col">Number of points</th><th scope="col">Unit</th></tr></thead>
          <tbody>{pointItems.map((item) => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.quantity}</td><td title={item.uomName}>{item.unit}</td></tr>)}</tbody>
        </table>
      </div> : null}
    </section>;
    })}
    <div className="furniture-review__files">
      <h6>Uploaded documents and site media{files.length ? ` (${files.length})` : ""}</h6>
      {files.length ? <WorkflowMediaList items={files} label="Files for furniture review" getKey={evidenceKey} busy={files.some((file) => downloads.has(evidenceKey(file)))} renderItem={(file) => <>
        <div><span className="workflow-stage-actions__media-name">{file.filename}</span><span className="workflow-stage-actions__media-meta">{sourceLabel(file)} · {formatEvidenceSize(file.byteSize)}{!canPreview(file.mimeType) ? " · Download to view" : ""}</span></div>
        <div className="furniture-review__file-actions">
          {canPreview(file.mimeType) ? <Button size="compact" variant="secondary" aria-label={`View ${file.filename}`} onClick={() => setSelected(file)}>View</Button> : null}
          <EvidenceDownload projectId={projectId} file={file} onBusyChange={(busy) => setDownloads((current) => {
            const next = new Set(current);
            if (busy) next.add(evidenceKey(file)); else next.delete(evidenceKey(file));
            return next;
          })} />
        </div>
      </>} /> : <p>No documents or site media have been uploaded for this review. A sketch is optional.</p>}
    </div>
    {selected && selectionIsCurrent ? <EvidencePreview key={evidenceKey(selected)} projectId={projectId} file={selected} onClose={() => setSelected(undefined)} /> : null}
  </section>;
}

function EvidenceDownload({ projectId, file, onBusyChange }: { projectId: string; file: FurnitureReviewEvidence; onBusyChange?: (busy: boolean) => void }) {
  const notify = useRef(onBusyChange);
  notify.current = onBusyChange;
  // Refreshed metadata can remove a row or move it to another page during download.
  useEffect(() => () => notify.current?.(false), []);
  return <DownloadButton label={`Download ${file.filename}`} iconOnly loadingLabel={`Downloading ${file.filename}…`}
    errorMessage="This file could not be downloaded. Please try again." fallbackFilename={file.filename}
    className="ui-button ui-button--secondary ui-button--compact" onBusyChange={onBusyChange} getFile={() => getEvidence(projectId, file)} />;
}

function EvidencePreview({ projectId, file, onClose }: { projectId: string; file: FurnitureReviewEvidence; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mimeType: string }>();

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setBusy(true); setError(""); setUnsupported(false); setPreview(undefined);
    void getEvidence(projectId, file, controller.signal).then(({ blob }) => {
      if (controller.signal.aborted) return;
      // Trust the protected response type, never the filename or projected metadata.
      if (!canPreview(blob.type)) { setUnsupported(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, mimeType: blob.type });
    }).catch(() => {
      if (!controller.signal.aborted) setError("The file could not be loaded. Please try again or download it.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, file, attempt]);

  const previewFailed = () => { setPreview(undefined); setError("Your browser could not display this file. Download it to review, or try again."); };
  return <ContextPanel title={file.filename} eyebrow={sourceLabel(file)} width="wide" onClose={onClose}>
    <div className="furniture-review__preview">
      <div className="furniture-review__preview-tools"><span>{formatEvidenceSize(file.byteSize)}</span><EvidenceDownload projectId={projectId} file={file} /></div>
      {busy ? <p role="status">Loading file…</p> : null}
      {error ? <div role="alert"><p>{error}</p><Button size="compact" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</Button></div> : null}
      {unsupported ? <p role="status">This file cannot be previewed in your browser. Download it to review.</p> : null}
      {preview && imageTypes.has(preview.mimeType) ? <img src={preview.url} alt={file.filename} onError={previewFailed} /> : null}
      {preview?.mimeType === "application/pdf" ? <iframe src={preview.url} title={file.filename} onError={previewFailed} /> : null}
      {preview && videoTypes.has(preview.mimeType) ? <video src={preview.url} controls playsInline preload="metadata" aria-label={file.filename} onError={previewFailed}>Your browser cannot play this video. Download it to review.</video> : null}
    </div>
  </ContextPanel>;
}
