import { Plus, UserRound } from "lucide-react";
import { useId } from "react";

import { Button } from "../../components/ui/Button";
import { KnowledgeCardHeading } from "./KnowledgeCardHeading";
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
  readonly presentation?: "default" | "overview";
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
  readonly onEditSurface?: (surface: KnowledgeMaster) => void;
}

export function KnowledgeModeSurfacePanel({
  presentation = "default",
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
  onQuickAdd,
  onEditSurface
}: KnowledgeModeSurfacePanelProps) {
  const generatedId = useId().replaceAll(":", "");
  const errorId = `${generatedId}-error`;
  const hasSurfaces = surfaces.length > 0;
  const controlsDisabled = saving
    || sectionState.status !== "ready"
    || catalogState.status !== "ready";
  const overview = presentation === "overview";
  const canAddSurface = canQuickAdd && !readOnly;
  const selectionReady = sectionState.status === "ready" && catalogState.status === "ready";
  const stateLabel = readOnly ? (
    <span className="knowledge-readonly-label">Read-only revision</span>
  ) : dirty ? (
    <span className="knowledge-mode-surfaces__dirty">
      {saving ? "Saving…" : "Unsaved changes"}
    </span>
  ) : null;

  function addSurface() {
    onQuickAdd((surface) => onChange(unique([...selectedIds, surface.id])));
  }

  return (
    <div className={`knowledge-mode-surfaces${overview ? " knowledge-mode-surfaces--overview" : ""}`} aria-labelledby="knowledge-mode-surfaces-heading">
      <KnowledgeCardHeading
        className="knowledge-mode-surfaces__heading"
        icon={<UserRound />}
        titleId="knowledge-mode-surfaces-heading"
        title="Surfaces"
        description="Select every surface where this Main Line can be used."
        trailing={overview ? (
          <div className="knowledge-overview-surfaces__header-actions">
            {stateLabel}
            {canAddSurface ? (
              <Button
                variant="primary"
                leadingIcon={<Plus />}
                disabled={controlsDisabled}
                onClick={addSurface}
              >
                Add Surface
              </Button>
            ) : null}
          </div>
        ) : stateLabel}
      />

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
        {canAddSurface ? (
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<Plus />}
            className={overview ? "knowledge-overview-surfaces__create" : undefined}
            aria-label={overview ? "Create Surface" : undefined}
            title={overview ? "Create Surface" : undefined}
            disabled={controlsDisabled}
            onClick={addSurface}
          >
            {overview ? null : "Add Surface"}
          </Button>
        ) : null}
      </div>

      {overview && selectionReady ? (
        <table className="knowledge-overview-surfaces__table" aria-label="Selected surface details">
          <colgroup>
            <col className="knowledge-overview-surfaces__number-column" />
            <col className="knowledge-overview-surfaces__name-column" />
            <col />
            <col className="knowledge-overview-surfaces__actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col"><span aria-hidden="true">#</span><span className="sr-only">Number</span></th>
              <th scope="col">Surface name</th>
              <th scope="col">Description</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {selectedIds.map((surfaceId, index) => {
              const surface = surfaces.find(({ id }) => id === surfaceId);
              const name = surface?.name ?? "Unavailable value";
              return (
                <tr key={surfaceId}>
                  <td className="knowledge-overview-surfaces__number">{index + 1}</td>
                  <th scope="row">
                    <span>{name}</span>
                    {surface && surface.status !== "active" ? (
                      <span className="knowledge-overview-surfaces__surface-status">
                        {surface.status === "archived" ? "Archived" : "Inactive"}
                      </span>
                    ) : null}
                  </th>
                  <td className="knowledge-overview-surfaces__description">
                    {surface
                      ? surface.description?.trim() || "No examples recorded."
                      : "This Surface is no longer available."}
                  </td>
                  <td>
                    <div className="knowledge-overview-surfaces__row-actions">
                      {surface && surface.status !== "archived" && onEditSurface && !readOnly ? (
                        <Button
                          variant="quiet"
                          className="knowledge-overview-surfaces__row-action"
                          aria-label={`Edit reusable surface ${name}`}
                          title={`Edit reusable surface ${name}`}
                          leadingIcon={<SurfaceActionIcon action="edit" />}
                          disabled={controlsDisabled}
                          onClick={() => onEditSurface(surface)}
                        />
                      ) : null}
                      <Button
                        variant="quiet"
                        className="knowledge-overview-surfaces__row-action"
                        aria-label={`Remove ${name} from Main Line`}
                        title={surface ? `Remove ${name} from Main Line` : "Unavailable surfaces cannot be removed"}
                        leadingIcon={<SurfaceActionIcon action="remove" />}
                        disabled={controlsDisabled || readOnly || !surface}
                        onClick={() => onChange(selectedIds.filter((id) => id !== surfaceId))}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {selectedIds.length === 0 ? (
              <tr><td colSpan={4} className="knowledge-overview-surfaces__empty">No surfaces selected.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : !overview && selectedIds.length && selectionReady ? (
        <ul className="knowledge-mode-surfaces__selected" aria-label="Selected surface details">
          {selectedIds.map((surfaceId) => {
            const surface = surfaces.find(({ id }) => id === surfaceId);
            return (
              <li key={surfaceId}>
                <p className="knowledge-mode-surfaces__selected-name">
                  {surface?.name ?? "Unavailable value"}
                </p>
                {/* The shared Surface description, shown so the author can tell
                    surfaces apart here. It is edited in Reusable Values. */}
                <p className="knowledge-mode-surfaces__selected-description">
                  {surface
                    ? surface.description?.trim() || "No examples recorded."
                    : "This Surface is no longer available."}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

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

function SurfaceActionIcon({ action }: { readonly action: "edit" | "remove" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false" aria-hidden="true">
      {action === "edit" ? (
        <><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /><path d="M13 20h7" /></>
      ) : <><path d="m7 7 10 10M17 7 7 17" /></>}
    </svg>
  );
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}
