import { useId, useRef, useState, type RefObject } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  DESIGN_LAYOUT_LABELS,
  isDesignLayoutType,
  type ClassifyDesignLayoutCommand,
  type DesignLayoutCoverage,
  type DesignLayoutRequirements,
  type DesignLayoutType
} from "../../../../shared/projects/designLayoutRequirements";
import { ApiError } from "../../api/client";
import type { EstimateDesignUpload } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { classifyEstimateDesignUpload, uploadEstimateDesign } from "./estimateDesignApi";
import "./designLayoutRequirements.css";

export const designLayoutLabel = (type: unknown) => isDesignLayoutType(type) ? DESIGN_LAYOUT_LABELS[type] : "Layout type not set";

export function layoutSubmissionBlocker(requirements: DesignLayoutRequirements | null): string | null {
  if (!requirements || requirements.status === "unavailable") return "Layout requirements are unavailable. Refresh design plans before continuing.";
  if (requirements.status === "waiting_for_choice") return "Waiting for the Client to choose an execution path";
  if (requirements.status === "not_applicable" || requirements.coverageComplete) return null;
  if (requirements.blockingReasons.length) return requirements.blockingReasons.join(" ");
  if (requirements.unclassifiedUploadIds.length) return "Set the layout type for existing draft files before submitting.";
  return requirements.missingTypes.map(type => `${DESIGN_LAYOUT_LABELS[type]} missing`).join(". ") || "Layout review is incomplete.";
}

function coverageLabel(coverage: DesignLayoutCoverage) {
  const label = DESIGN_LAYOUT_LABELS[coverage.layoutType];
  if (coverage.state === "missing") return `${label} missing`;
  if (coverage.state === "processing") return `${label} processing`;
  if (coverage.state === "review_pending") return `${label} uploaded; drawing review pending`;
  return `${label} present; drawing and PDF checks still apply`;
}

export function RequiredLayoutUploads({
  estimateId, requirements, loading, refreshing, failed, readOnly, showUploadControls, onChanged, onRefresh
}: {
  estimateId: string;
  requirements: DesignLayoutRequirements | null;
  loading: boolean;
  refreshing: boolean;
  failed: boolean;
  readOnly: boolean;
  showUploadControls: boolean;
  onChanged: () => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
}) {
  const titleId = useId();
  const selected = requirements?.status === "selected";
  const blocker = layoutSubmissionBlocker(requirements);
  const additionalReasons = requirements?.blockingReasons.filter(reason =>
    !requirements.missingTypes.some(type => {
      const normalized = reason.replace(/[.!]$/, "");
      return normalized === `${DESIGN_LAYOUT_LABELS[type]} missing` || normalized === `${DESIGN_LAYOUT_LABELS[type]} is required before Client review`;
    })
  ) ?? [];
  return <section className="design-layout-requirements" aria-labelledby={titleId}>
    <header>
      <h3 id={titleId}>Required layouts</h3>
      <Button variant="secondary" size="compact" disabled={loading || refreshing} onClick={() => void onRefresh()}>Refresh layout requirements</Button>
    </header>
    {loading ? <p role="status">Loading layout requirements…</p> : failed ? <p role="alert">Layout requirements could not be refreshed. Refresh before uploading or submitting.</p> : null}
    {!loading && selected ? <>
      <p>{requirements.choice!.optionLabel}: {requirements.choice!.phases.map(phase => phase.label).join(" → ")}</p>
      <ul aria-label="Required layout status">
        {requirements.coverage.map(coverage => <li key={coverage.layoutType}>{coverageLabel(coverage)}</li>)}
      </ul>
      {requirements.unclassifiedUploadIds.length ? <p>Existing draft files need a layout type. Label each file once in the upload list below.</p> : null}
      {additionalReasons.map(reason => <p key={reason}>{reason}</p>)}
      {refreshing ? <p role="status">Checking the latest layout requirements…</p> : null}
      {!readOnly && showUploadControls ? <div className="design-layout-requirements__uploads">
        {requirements.allowedTypes.map(layoutType => <LayoutFileUpload
          key={layoutType} estimateId={estimateId} layoutType={layoutType}
          disabled={failed || refreshing} onChanged={onChanged}
        />)}
      </div> : null}
    </> : !loading && blocker ? <p role="status">{blocker}</p> : null}
  </section>;
}

function LayoutFileUpload({ estimateId, layoutType, disabled, onChanged }: {
  estimateId: string; layoutType: DesignLayoutType; disabled: boolean; onChanged: () => Promise<unknown>;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<number>();
  const label = DESIGN_LAYOUT_LABELS[layoutType];
  const upload = useMutation({
    mutationFn: (selected: File) => uploadEstimateDesign(estimateId, selected, setProgress, layoutType),
    retry: false,
    onSuccess: async () => {
      setFile(undefined);
      if (input.current) input.current.value = "";
      await onChanged();
    },
    onError: async () => { await onChanged(); },
    onSettled: () => { inFlight.current = false; setProgress(undefined); }
  });
  return <form className="design-layout-upload" aria-label={`${label} upload`} onSubmit={event => {
    event.preventDefault();
    if (!file || disabled || inFlight.current) return;
    inFlight.current = true;
    setProgress(0);
    upload.mutate(file);
  }}>
    <label htmlFor={inputId}>{label}</label>
    <input ref={input} id={inputId} aria-label={`${label} file`} type="file"
      accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,image/heic,image/heif,.heif"
      disabled={disabled || upload.isPending}
      onChange={event => { setFile(event.target.files?.[0]); upload.reset(); }} />
    {file ? <p className="design-layout-upload__file"><span>{file.name}</span><small>{file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}</small></p> : null}
    <Button type="submit" disabled={disabled || !file} busy={upload.isPending} busyLabel="Uploading…">Upload {label}</Button>
    {progress !== undefined ? <ProgressBar value={progress} label={`Uploading ${label}`} /> : null}
    {upload.isError ? <p role="alert">{upload.error instanceof ApiError ? `The plan could not be uploaded. ${upload.error.message}` : "The upload result could not be confirmed. Review the refreshed upload list before trying the file again."}</p> : null}
  </form>;
}

export function ClassifyLayoutDialog({ upload, requirements, disabled, onChanged, onClose, fallbackFocusRef }: {
  upload: EstimateDesignUpload;
  requirements: DesignLayoutRequirements | null;
  disabled: boolean;
  onChanged: () => Promise<unknown>;
  onClose: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  const selectId = useId();
  const [layoutType, setLayoutType] = useState<DesignLayoutType | "">("");
  const [command, setCommand] = useState<ClassifyDesignLayoutCommand>();
  const saving = useRef(false);
  const classify = useMutation({
    mutationFn: (next: ClassifyDesignLayoutCommand) => classifyEstimateDesignUpload(upload.id, next),
    retry: false,
    onSuccess: async () => { await onChanged(); onClose(); },
    onError: async () => { await onChanged(); },
    onSettled: () => { saving.current = false; }
  });
  const available = !disabled && upload.canClassifyLayoutType === true && !upload.layoutType && requirements?.status === "selected";
  const stale = command && command.expectedDesignPlanVersion !== requirements?.designPlanVersion;
  const savedType = isDesignLayoutType(upload.layoutType) ? upload.layoutType : null;
  const allowed = requirements?.status === "selected" ? requirements.allowedTypes : [];
  return <Dialog title="Set layout type permanently?" description="This label cannot be changed after saving." busy={classify.isPending} onClose={onClose} fallbackFocusRef={fallbackFocusRef}>
    <div className="ui-dialog__form">
      <div className="ui-dialog__body">
        <p className="design-layout-upload__file">{upload.originalFilename}</p>
        <label htmlFor={selectId}>Layout type</label>
        <Select id={selectId} value={layoutType} disabled={!available || classify.isPending || Boolean(command)} onChange={event => {
          if (isDesignLayoutType(event.target.value)) setLayoutType(event.target.value);
        }}>
          <option value="" disabled>Choose a layout type</option>
          {allowed.map(type => <option key={type} value={type}>{DESIGN_LAYOUT_LABELS[type]}</option>)}
        </Select>
        <p>Confirm what this file contains. A file can count as only one layout type. Saving the label reuses the existing file.</p>
        {savedType ? <p role="status">Saved layout type: {DESIGN_LAYOUT_LABELS[savedType]}. This label is permanent.</p> : !available || stale ? <p role="status">{upload.classificationBlockedReason ?? "This draft can no longer be labeled with the current selection. Refresh its details before continuing."}</p> : null}
        {classify.isError && !savedType ? <p role="alert">{classify.error instanceof ApiError ? classify.error.message : "The save result could not be confirmed. Retry to check the same saved choice."}</p> : null}
      </div>
      <div className="ui-dialog__actions">
        <Button variant="secondary" disabled={classify.isPending} onClick={onClose}>{savedType ? "Close" : "Cancel"}</Button>
        {!savedType ? <Button disabled={!available || !layoutType || Boolean(stale) || !allowed.includes(layoutType as DesignLayoutType)} busy={classify.isPending} busyLabel="Saving…" onClick={() => {
          if (!available || !layoutType || stale || saving.current || !requirements) return;
          saving.current = true;
          const next = command ?? { layoutType, expectedDesignPlanVersion: requirements.designPlanVersion, idempotencyKey: crypto.randomUUID() };
          setCommand(next);
          classify.mutate(next);
        }}>{classify.isError ? "Retry saving layout type" : "Confirm layout type"}</Button> : null}
      </div>
    </div>
  </Dialog>;
}
