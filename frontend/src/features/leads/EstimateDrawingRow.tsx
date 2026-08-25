import { useEffect, useId, useRef, useState } from "react";

import { ProtectedImage } from "../../components/design/ProtectedImage";
import type { EstimateDesignDrawing } from "../../api/types";
import { estimateDesignRevisionImageUrl } from "./estimateDesignApi";

export interface EstimateDrawingRowProps {
  drawing: EstimateDesignDrawing;
  roomLabel: string;
  scopeLabel: string;
  onPreview: () => void;
  onCorrect: () => void;
  onReplace: () => void;
  onHistory: () => void;
  onAssignItem?: () => void;
  changeSummary?: string | null;
  focusOnRender?: boolean;
  onFocused?: () => void;
  readOnly?: boolean;
}

type EstimateDrawingRowWithRevisionProps = EstimateDrawingRowProps & {
  revisionId?: string;
  reviewStatus?: "draft" | "submitted" | "approved" | "changes_requested";
  onVerify?: () => void;
  onRemove?: () => void;
  needsCorrection?: boolean;
};

export function EstimateDrawingRow({
  drawing,
  roomLabel,
  scopeLabel,
  onPreview,
  onCorrect,
  onReplace,
  onHistory,
  onAssignItem,
  changeSummary,
  focusOnRender = false,
  onFocused,
  readOnly = false,
  revisionId,
  reviewStatus = "draft",
  onVerify,
  onRemove,
  needsCorrection = false
}: EstimateDrawingRowWithRevisionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const status = reviewStatus === "changes_requested" ? "Changes requested"
    : reviewStatus === "approved" ? "Approved"
      : reviewStatus === "submitted" ? "Awaiting client review"
        : drawing.verified ? "Ready for client" : "Needs review";
  const correctionAvailable = !readOnly &&
    (reviewStatus === "draft" || reviewStatus === "changes_requested");
  const unverified = !drawing.verified || needsCorrection;

  useEffect(() => {
    if (!focusOnRender) return;
    rowRef.current?.focus();
    onFocused?.();
  }, [focusOnRender, onFocused]);

  return (
    <article
      ref={rowRef}
      className="estimate-drawing-row"
      aria-label={`${drawing.displayTitle} drawing`}
      tabIndex={focusOnRender ? -1 : undefined}
    >
      <ProtectedImage
        source={estimateDesignRevisionImageUrl(revisionId ?? drawing.id)}
        alt={`${drawing.displayTitle} thumbnail`}
        className="estimate-drawing-row__thumbnail"
      />
      <div className="estimate-drawing-row__metadata">
        <strong>{drawing.displayTitle}</strong>
        <small>{roomLabel} · {scopeLabel}</small>
        {changeSummary ? <small className="estimate-drawing-row__change-summary">{changeSummary}</small> : null}
      </div>
      <span className={`estimate-drawing-row__status estimate-drawing-row__status--${drawing.verified ? "verified" : "review"}`}>{status}</span>
      <button type="button" className="secondary-button estimate-drawing-row__preview" onClick={onPreview}>Preview</button>
      <div className="estimate-drawing-row__menu-wrap">
        <button
          type="button"
          className="secondary-button estimate-drawing-row__menu-trigger"
          aria-label={`More actions for ${drawing.displayTitle}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          More
        </button>
        {menuOpen ? (
          <div id={menuId} className="estimate-drawing-row__menu" role="menu" aria-label={`${drawing.displayTitle} actions`}>
            {correctionAvailable && unverified ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onCorrect(); }}>Correct mapping or crop</button> : null}
            {correctionAvailable && unverified ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); (onVerify ?? onCorrect)(); }}>Verify drawing</button> : null}
            {correctionAvailable && onAssignItem ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onAssignItem(); }}>{drawing.mappingStatus === "misc" ? "Assign estimate item" : "Change estimate item"}</button> : null}
            {correctionAvailable && !drawing.verified && onRemove ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRemove(); }}>Remove drawing</button> : null}
            {!readOnly && reviewStatus === "changes_requested" ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReplace(); }}>Upload replacement</button> : null}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onHistory(); }}>History</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
