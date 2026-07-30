import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CropRect,
  EstimateDesignDrawing,
  EstimateDesignRevision,
  EstimateDesignSourcePage
} from "../../api/types";
import { CropEditor, cropIsValid } from "../../components/design/CropEditor";
import { EstimateDrawingPreviewDialog } from "../../components/design/EstimateDrawingPreviewDialog";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateDrawingRow } from "./EstimateDrawingRow";
import {
  createManualEstimateDrawing,
  editEstimateDrawing,
  estimateDesignKeys,
  estimateDesignRevisionImageUrl,
  estimateDesignSourcePageImageUrl,
  getEstimateDesignWorkspace,
  replaceEstimateDrawing,
  removeEstimateDrawing,
  retryEstimateDesignUpload,
  submitEstimateDrawings,
  uploadEstimateDesign
} from "./estimateDesignApi";

export interface EstimateDesignPlacementOption {
  id: string;
  label: string;
}

interface EstimateDesignUploadsProps {
  estimateId: string;
  rooms: EstimateDesignPlacementOption[];
  scopes: EstimateDesignPlacementOption[];
}

type DrawingSelection = { drawing: EstimateDesignDrawing; revision: EstimateDesignRevision };
type DrawingChange = Omit<Parameters<typeof editEstimateDrawing>[1], "version">;

function latestRevisions(revisions: EstimateDesignRevision[]) {
  const latest = new Map<string, EstimateDesignRevision>();
  revisions.forEach((revision) => {
    const current = latest.get(revision.drawingId);
    if (!current || current.revisionNumber < revision.revisionNumber) latest.set(revision.drawingId, revision);
  });
  return latest;
}

function cropIsWithinPage(crop: CropRect, page: { width: number; height: number }) {
  return crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
    crop.x + crop.width <= page.width && crop.y + crop.height <= page.height;
}

function statusLabel(status: string) {
  if (status === "estimator_review") return "Ready for estimator review";
  if (status === "processing_failed") return "Extraction failed";
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function EstimateDesignUploads({ estimateId, rooms, scopes }: EstimateDesignUploadsProps) {
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const [selection, setSelection] = useState<DrawingSelection>();
  const [mode, setMode] = useState<"preview" | "correct" | "history" | "replace">();
  const [replacement, setReplacement] = useState<File>();
  const [verifyOnOpen, setVerifyOnOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [focusRevision, setFocusRevision] = useState<{
    drawingId: string;
    revisionNumber: number;
  }>();

  const workspace = useQuery({
    queryKey: estimateDesignKeys.workspace(estimateId),
    queryFn: () => getEstimateDesignWorkspace(estimateId),
    refetchInterval: (query) => query.state.data?.uploads.some((upload) =>
      upload.extractionStatus === "queued" || upload.extractionStatus === "processing"
    ) ? 1_000 : false
  });
  const upload = useMutation({
    mutationFn: (nextFile: File) => uploadEstimateDesign(estimateId, nextFile),
    onSuccess: () => {
      setFile(undefined);
      void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) });
    }
  });
  const correct = useMutation({
    mutationFn: ({ drawing, revision, input }: DrawingSelection & { input: DrawingChange }) =>
      editEstimateDrawing(drawing.id, { ...input, version: revision.revisionNumber }),
    onSuccess: () => {
      closeDialog();
      void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) });
    }
  });
  const replace = useMutation({
    mutationFn: ({ drawing, revision, file: nextFile }: DrawingSelection & { file: File }) =>
      replaceEstimateDrawing(drawing.id, revision.revisionNumber, nextFile),
    onSuccess: async (result, input) => {
      closeDialog();
      if ("queued" in result) {
        setActionNotice("Replacement queued for extraction.");
      } else {
        setFocusRevision({
          drawingId: input.drawing.id,
          revisionNumber: result.revision.revisionNumber
        });
        setActionNotice(`Replacement drawing created. Revision ${result.revision.revisionNumber} awaits verification.`);
      }
      await client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) });
    }
  });
  const retry = useMutation({ mutationFn: retryEstimateDesignUpload, onSuccess: () => void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) }) });
  const createManual = useMutation({
    mutationFn: ({
      pageId,
      input
    }: {
      pageId: string;
      input: Parameters<typeof createManualEstimateDrawing>[1];
    }) => createManualEstimateDrawing(pageId, input),
    onSuccess: () => {
      setManualOpen(false);
      setActionNotice("Missing drawing added for estimator review.");
      void client.invalidateQueries({
        queryKey: estimateDesignKeys.workspace(estimateId)
      });
    }
  });
  const remove = useMutation({ mutationFn: ({ drawing, revision }: DrawingSelection) => removeEstimateDrawing(drawing.id, revision.revisionNumber), onSuccess: () => void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) }) });
  const submit = useMutation({
    mutationFn: () => submitEstimateDrawings(estimateId),
    onSuccess: () => void client.invalidateQueries({ queryKey: estimateDesignKeys.workspace(estimateId) })
  });

  const latest = useMemo(() => latestRevisions(workspace.data?.revisions ?? []), [workspace.data?.revisions]);
  const activeDrawings = (workspace.data?.drawings ?? []).filter((drawing) => drawing.active && latest.has(drawing.id));
  const roomIds = new Set(rooms.map((room) => room.id));
  const scopeIds = new Set(scopes.map((scope) => scope.id));
  const unresolved = activeDrawings.filter((drawing) => !drawing.verified || !drawing.roomId || !drawing.scopeSectionId || !roomIds.has(drawing.roomId) || !scopeIds.has(drawing.scopeSectionId));
  const grouped = useMemo(() => {
    const result = new Map<string, EstimateDesignDrawing[]>();
    activeDrawings.filter((drawing) => drawing.verified && drawing.roomId && drawing.scopeSectionId).forEach((drawing) => {
      const key = `${drawing.roomId}\u0000${drawing.scopeSectionId}`;
      result.set(key, [...(result.get(key) ?? []), drawing]);
    });
    return result;
  }, [activeDrawings]);
  const closeDialog = () => {
    setMode(undefined);
    setSelection(undefined);
    setReplacement(undefined);
    setFormError("");
    setVerifyOnOpen(false);
  };
  const open = (next: DrawingSelection, nextMode: NonNullable<typeof mode>, verify = false) => {
    setSelection(next);
    setMode(nextMode);
    setFormError("");
    setVerifyOnOpen(verify);
  };
  const clearDrawingFocus = useCallback(() => setFocusRevision(undefined), []);
  const row = (drawing: EstimateDesignDrawing, roomLabel: string, scopeLabel: string) => {
    const revision = latest.get(drawing.id)!;
    return <EstimateDrawingRow
      key={drawing.id}
      drawing={drawing}
      roomLabel={roomLabel}
      scopeLabel={scopeLabel}
      revisionId={revision.id}
      reviewStatus={revision.reviewStatus}
      changeSummary={revision.changeSummary}
      focusOnRender={
        focusRevision?.drawingId === drawing.id &&
        focusRevision.revisionNumber === revision.revisionNumber
      }
      onFocused={clearDrawingFocus}
      needsCorrection={!drawing.roomId || !drawing.scopeSectionId || !roomIds.has(drawing.roomId) || !scopeIds.has(drawing.scopeSectionId)}
      onPreview={() => open({ drawing, revision }, "preview")}
      onCorrect={() => open({ drawing, revision }, "correct")}
      onVerify={() => open({ drawing, revision }, "correct", true)}
      onRemove={() => remove.mutate({ drawing, revision })}
      onReplace={() => open({ drawing, revision }, "replace")}
      onHistory={() => open({ drawing, revision }, "history")}
    />;
  };
  const readyToSubmit = activeDrawings.length > 0 && unresolved.length === 0 &&
    workspace.data?.uploads.every((upload) => upload.extractionStatus === "estimator_review" || upload.extractionStatus === "approved");

  return (
    <section className="estimate-design-uploads" aria-labelledby="estimate-design-uploads-title">
      <header className="estimate-design-uploads__header">
        <div><p className="eyebrow">Plans and drawing review</p><h2 id="estimate-design-uploads-title">Upload design plans</h2><p>Extracted drawings remain private until every active drawing is verified and submitted.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); if (file) upload.mutate(file); }}>
          <label className="sr-only" htmlFor="estimate-design-upload-file">Design plan file</label>
          <input id="estimate-design-upload-file" aria-label="Design plan file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,image/heic,image/heif,.heif" onChange={(event) => setFile(event.target.files?.[0])} />
          <button type="submit" className="button button--primary" disabled={!file || upload.isPending}>{upload.isPending ? "Uploading…" : "Upload design plan"}</button>
        </form>
      </header>
      {upload.isError ? <p role="alert" className="estimate-design-uploads__error">The plan could not be uploaded. Try the selected file again.</p> : null}
      {retry.isError ? <p role="alert" className="estimate-design-uploads__error">The extraction could not be retried. Try again shortly.</p> : null}
      {remove.isError ? <p role="alert" className="estimate-design-uploads__error">The drawing could not be removed. Refresh and try again.</p> : null}
      {formError ? <p role="alert" className="estimate-design-uploads__error">{formError}</p> : null}
      {actionNotice ? <p role="status" className="estimate-notice">{actionNotice}</p> : null}
      {workspace.isPending ? <p role="status">Loading design plans…</p> : null}
      {workspace.isError ? <p role="alert">We couldn't load design plans. <button type="button" className="secondary-button" onClick={() => void workspace.refetch()}>Try again</button></p> : null}
      {workspace.data ? <>
        {workspace.data.uploads.length ? <ul className="estimate-design-uploads__status-list" aria-label="Design upload status">{workspace.data.uploads.map((item) => <li key={item.id}><span>{item.originalFilename}</span><strong>{statusLabel(item.extractionStatus)}</strong>{item.failureMessage ? <small>{item.failureMessage}</small> : null}{item.extractionStatus === "processing_failed" && item.canRetry ? <button type="button" className="secondary-button" disabled={retry.isPending} onClick={() => retry.mutate(item.id)}>{retry.isPending ? "Retrying…" : "Retry extraction"}</button> : null}</li>)}</ul> : <p className="estimate-design-uploads__empty">Upload a PDF or plan image to extract drawings for this estimate.</p>}
        {workspace.data.pages.length ? <button type="button" className="secondary-button" onClick={() => setManualOpen(true)}>Add missing drawing</button> : null}
        {unresolved.length ? <section className="estimate-design-uploads__placement" aria-label="Needs placement"><header><h3>Needs placement</h3><p>These extracted drawings need a verified room and scope before client submission.</p></header>{unresolved.map((drawing) => row(drawing, drawing.roomId ? rooms.find((room) => room.id === drawing.roomId)?.label ?? "Unknown room" : "Unassigned room", drawing.scopeSectionId ? scopes.find((scope) => scope.id === drawing.scopeSectionId)?.label ?? "Unknown scope" : "Unassigned scope"))}</section> : null}
        {rooms.flatMap((room) => scopes.map((scope) => ({ room, scope, drawings: grouped.get(`${room.id}\u0000${scope.id}`) ?? [] }))).filter((group) => group.drawings.length).map((group) => <section className="estimate-design-uploads__group" aria-label={`${group.room.label}, ${group.scope.label} drawings`} key={`${group.room.id}:${group.scope.id}`}><h3>{group.room.label} <span>→</span> {group.scope.label}</h3>{group.drawings.map((drawing) => row(drawing, group.room.label, group.scope.label))}</section>)}
        {activeDrawings.length ? <footer className="estimate-design-uploads__footer"><span>{unresolved.length ? `${unresolved.length} drawing${unresolved.length === 1 ? "" : "s"} need verification.` : "All drawings are verified."}</span><button type="button" className="button button--primary" disabled={!readyToSubmit || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit drawings to client"}</button></footer> : null}
        {submit.isError ? <p role="alert" className="estimate-design-uploads__error">The drawings could not be submitted. Verify every active drawing and try again.</p> : null}
      </> : null}
      {selection && mode === "preview" ? <PreviewDialog selection={selection} onClose={closeDialog} /> : null}
      {selection && mode === "correct" ? <CorrectionDialog selection={selection} defaultVerified={verifyOnOpen} rooms={rooms} scopes={scopes} page={workspace.data?.pages.find((page) => page.id === selection.revision.sourcePageId) ?? workspace.data?.pages.find((page) => page.id === selection.drawing.sourcePageId)} busy={correct.isPending} error={correct.isError ? "The correction was not saved." : ""} onSubmit={(input) => correct.mutate({ ...selection, input })} onClose={closeDialog} /> : null}
      {selection && mode === "history" ? <HistoryDialog revisions={(workspace.data?.revisions ?? []).filter((revision) => revision.drawingId === selection.drawing.id)} onClose={closeDialog} /> : null}
      {selection && mode === "replace" ? <ReplacementDialog file={replacement} busy={replace.isPending} error={replace.isError ? "The replacement was not uploaded." : ""} onChange={setReplacement} onSubmit={() => replacement && replace.mutate({ ...selection, file: replacement })} onClose={closeDialog} /> : null}
      {manualOpen && workspace.data?.pages.length ? <ManualDrawingDialog
        pages={workspace.data.pages}
        rooms={rooms}
        scopes={scopes}
        busy={createManual.isPending}
        error={createManual.isError ? "The missing drawing could not be added." : ""}
        onSubmit={(pageId, input) => createManual.mutate({ pageId, input })}
        onClose={() => setManualOpen(false)}
      /> : null}
    </section>
  );
}

function PreviewDialog({ selection, onClose }: { selection: DrawingSelection; onClose: () => void }) {
  const annotations = selection.revision.annotations ?? {
    schemaVersion: 1 as const,
    imageWidth: selection.revision.crop.width,
    imageHeight: selection.revision.crop.height,
    elements: []
  };
  return <EstimateDrawingPreviewDialog
    title={selection.drawing.displayTitle}
    imageUrl={estimateDesignRevisionImageUrl(selection.revision.id)}
    imageWidth={annotations.imageWidth}
    imageHeight={annotations.imageHeight}
    annotations={annotations}
    canAnnotate={false}
    onClose={onClose}
  />;
}

function CorrectionDialog({ selection, defaultVerified, rooms, scopes, page, busy, error, onSubmit, onClose }: { selection: DrawingSelection; defaultVerified: boolean; rooms: EstimateDesignPlacementOption[]; scopes: EstimateDesignPlacementOption[]; page?: { width: number; height: number }; busy: boolean; error: string; onSubmit: (input: DrawingChange) => void; onClose: () => void }) {
  const [title, setTitle] = useState(selection.drawing.displayTitle);
  const [roomId, setRoomId] = useState(selection.drawing.roomId ?? "");
  const [scopeSectionId, setScopeSectionId] = useState(selection.drawing.scopeSectionId ?? "");
  const [verified, setVerified] = useState(selection.drawing.verified || defaultVerified);
  const [crop, setCrop] = useState(selection.revision.crop);
  const [validation, setValidation] = useState("");
  return <Dialog title={`${defaultVerified ? "Verify" : "Correct"} ${selection.drawing.displayTitle}`} eyebrow="Drawing placement" onClose={onClose} busy={busy}><form className="estimate-drawing-correction" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !roomId || !scopeSectionId) { setValidation("Choose a room and scope and provide a drawing title."); return; } if (!page || !cropIsWithinPage(crop, page)) { setValidation("Crop boundaries must remain inside the source page."); return; } onSubmit({ displayTitle: title, roomId, scopeSectionId, crop, verified }); }}><label>Drawing title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Room<select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Choose room</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.label}</option>)}</select></label><label>Scope section<select value={scopeSectionId} onChange={(event) => setScopeSectionId(event.target.value)}><option value="">Choose scope</option>{scopes.map((scope) => <option value={scope.id} key={scope.id}>{scope.label}</option>)}</select></label><fieldset><legend>Crop boundaries</legend><div className="estimate-drawing-correction__crop">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key}<input aria-label={`Crop ${key}`} type="number" min={key === "width" || key === "height" ? 1 : 0} value={crop[key]} onChange={(event) => setCrop((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))} /></label>)}</div></fieldset><label className="estimate-drawing-correction__verify"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> Mark mapping verified</label>{validation || error ? <p role="alert">{validation || error}</p> : null}<div className="estimate-drawing-correction__actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? "Saving…" : defaultVerified ? "Verify drawing" : "Save drawing"}</button></div></form></Dialog>;
}

function HistoryDialog({ revisions, onClose }: { revisions: EstimateDesignRevision[]; onClose: () => void }) {
  return <Dialog title="Drawing history" eyebrow="Immutable revisions" onClose={onClose}><ol className="estimate-drawing-history">{revisions.slice().reverse().map((revision) => <li key={revision.id}><strong>Revision {revision.revisionNumber} · {revision.reviewStatus.replaceAll("_", " ")}</strong>{revision.changeSummary ? <span>{revision.changeSummary}</span> : null}</li>)}</ol></Dialog>;
}

function ReplacementDialog({ file, busy, error, onChange, onSubmit, onClose }: { file?: File; busy: boolean; error: string; onChange: (file: File | undefined) => void; onSubmit: () => void; onClose: () => void }) {
  return <Dialog title="Upload replacement" eyebrow="Client-requested change" onClose={onClose} busy={busy}><form className="estimate-drawing-replacement" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><label>Replacement drawing file<input aria-label="Replacement drawing file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,image/heic,image/heif,.heif" onChange={(event) => onChange(event.target.files?.[0])} /></label>{error ? <p role="alert">{error}</p> : null}<div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary" disabled={!file || busy}>{busy ? "Uploading…" : "Upload replacement"}</button></div></form></Dialog>;
}

function ManualDrawingDialog({
  pages,
  rooms,
  scopes,
  busy,
  error,
  onSubmit,
  onClose
}: {
  pages: EstimateDesignSourcePage[];
  rooms: EstimateDesignPlacementOption[];
  scopes: EstimateDesignPlacementOption[];
  busy: boolean;
  error: string;
  onSubmit: (
    pageId: string,
    input: Parameters<typeof createManualEstimateDrawing>[1]
  ) => void;
  onClose: () => void;
}) {
  const firstPage = pages[0]!;
  const [pageId, setPageId] = useState(firstPage.id);
  const [displayTitle, setDisplayTitle] = useState("");
  const [roomId, setRoomId] = useState("");
  const [scopeSectionId, setScopeSectionId] = useState("");
  const [crop, setCrop] = useState<CropRect>({
    x: 0,
    y: 0,
    width: firstPage.width,
    height: firstPage.height
  });
  const page = pages.find((candidate) => candidate.id === pageId) ?? firstPage;
  const cropPage = {
    ...page,
    imageUrl: estimateDesignSourcePageImageUrl(page.id)
  };
  const valid =
    displayTitle.trim().length > 0 &&
    Boolean(roomId) &&
    Boolean(scopeSectionId) &&
    cropIsValid(crop, cropPage);

  return (
    <Dialog
      title="Add missing drawing"
      eyebrow="Manual source-page crop"
      onClose={onClose}
      busy={busy}
    >
      <form
        className="estimate-drawing-correction"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onSubmit(page.id, {
            displayTitle,
            roomId,
            scopeSectionId,
            crop
          });
        }}
      >
        <label>
          Source page
          <select
            value={page.id}
            onChange={(event) => {
              const next = pages.find(
                (candidate) => candidate.id === event.target.value
              );
              if (!next) return;
              setPageId(next.id);
              setCrop({
                x: 0,
                y: 0,
                width: next.width,
                height: next.height
              });
            }}
          >
            {pages.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>
                Page {candidate.pageNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Drawing title
          <input
            value={displayTitle}
            onChange={(event) => setDisplayTitle(event.target.value)}
          />
        </label>
        <label>
          Room
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="">Choose room</option>
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>{room.label}</option>
            ))}
          </select>
        </label>
        <label>
          Scope section
          <select
            value={scopeSectionId}
            onChange={(event) => setScopeSectionId(event.target.value)}
          >
            <option value="">Choose scope</option>
            {scopes.map((scope) => (
              <option value={scope.id} key={scope.id}>{scope.label}</option>
            ))}
          </select>
        </label>
        <CropEditor
          label={displayTitle.trim() || "Missing drawing"}
          crop={crop}
          page={cropPage}
          onChange={setCrop}
        />
        {error ? <p role="alert">{error}</p> : null}
        <div className="estimate-drawing-correction__actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={!valid || busy}
          >
            {busy ? "Adding…" : "Add drawing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
