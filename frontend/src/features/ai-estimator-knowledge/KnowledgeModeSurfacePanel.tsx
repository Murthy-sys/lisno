import { Plus } from "lucide-react";
import { useId } from "react";

import { Button } from "../../components/ui/Button";
import type { KnowledgeMaster } from "./knowledgeTypes";
import { KnowledgeSurfaceMultiSelect } from "./KnowledgeSurfaceMultiSelect";

export interface KnowledgeSurfaceCatalogState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly refreshErrorMessage?: string;
  readonly onRetry?: () => void;
}

export interface KnowledgeSurfaceSectionState {
  readonly status: "loading" | "ready" | "error";
  readonly onRetry?: () => void;
}

export interface KnowledgeModeSurfacePanelProps {
  readonly selectedIds: readonly string[];
  readonly surfaces: readonly KnowledgeMaster[];
  readonly catalogState: KnowledgeSurfaceCatalogState;
  readonly sectionState: KnowledgeSurfaceSectionState;
  readonly readOnly: boolean;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly canQuickAdd: boolean;
  readonly error?: string;
  readonly onChange: (surfaceIds: readonly string[]) => void;
  readonly onQuickAdd: (select: (surface: KnowledgeMaster) => void) => void;
}

export function KnowledgeModeSurfacePanel({
  selectedIds,
  surfaces,
  catalogState,
  sectionState,
  readOnly,
  saving,
  dirty,
  canQuickAdd,
  error,
  onChange,
  onQuickAdd
}: KnowledgeModeSurfacePanelProps) {
  const generatedId = useId().replaceAll(":", "");
  const errorId = `${generatedId}-error`;
  const hasSurfaces = surfaces.length > 0;
  const controlsDisabled = saving
    || sectionState.status !== "ready"
    || catalogState.status !== "ready";

  return (
    <div className="knowledge-mode-surfaces" aria-labelledby="knowledge-mode-surfaces-heading">
      <div className="knowledge-section-heading knowledge-mode-surfaces__heading">
        <div>
          <h2 id="knowledge-mode-surfaces-heading">Surfaces</h2>
          <p>Select every surface where this Main Line can be used.</p>
        </div>
        {readOnly ? (
          <span className="knowledge-readonly-label">Read-only revision</span>
        ) : dirty ? (
          <span className="knowledge-mode-surfaces__dirty">
            {saving ? "Saving…" : "Unsaved changes"}
          </span>
        ) : null}
      </div>

      <div className="knowledge-mode-surfaces__controls">
        <KnowledgeSurfaceMultiSelect
          selectedIds={selectedIds}
          masters={surfaces}
          label="Applicable surfaces"
          placeholder="Select surfaces"
          searchable
          describedBy={error ? errorId : undefined}
          invalid={Boolean(error)}
          disabled={controlsDisabled}
          readOnly={readOnly}
          onChange={onChange}
        />
        {canQuickAdd && !readOnly ? (
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<Plus />}
            disabled={controlsDisabled}
            onClick={() => onQuickAdd((surface) => onChange(unique([...selectedIds, surface.id])))}
          >
            Add Surface
          </Button>
        ) : null}
      </div>

      {sectionState.status === "loading" ? (
        <p className="knowledge-mode-surfaces__state" role="status">Loading saved Surfaces…</p>
      ) : sectionState.status === "error" ? (
        <div className="knowledge-mode-surfaces__state" role="alert">
          <span>Surface configuration could not be loaded.</span>
          {sectionState.onRetry ? <Button type="button" size="compact" variant="quiet" onClick={sectionState.onRetry}>Retry Surfaces</Button> : null}
        </div>
      ) : catalogState.status === "loading" ? (
        <p className="knowledge-mode-surfaces__state" role="status">Loading surfaces…</p>
      ) : catalogState.status === "error" ? (
        <div className="knowledge-mode-surfaces__state" role="alert">
          <span>Surfaces could not be loaded.</span>
          {catalogState.onRetry ? <Button type="button" size="compact" variant="quiet" onClick={catalogState.onRetry}>Retry</Button> : null}
        </div>
      ) : !hasSurfaces ? (
        <p className="knowledge-mode-surfaces__state" role="status">No surfaces have been added.</p>
      ) : null}

      {catalogState.refreshing || catalogState.refreshErrorMessage ? (
        <div className="knowledge-mode-surfaces__state" role="status">
          <span>{catalogState.refreshErrorMessage ? "Surface options may be out of date." : "Refreshing surfaces…"}</span>
          {catalogState.refreshErrorMessage && catalogState.onRetry ? (
            <Button type="button" size="compact" variant="quiet" onClick={catalogState.onRetry}>Retry</Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p id={errorId} className="ui-field__error knowledge-mode-surfaces__error" role="alert">{error}</p> : null}
    </div>
  );
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}
