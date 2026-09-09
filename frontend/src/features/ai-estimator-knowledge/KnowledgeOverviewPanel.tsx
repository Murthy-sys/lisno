import { Plus } from "lucide-react";
import { useMemo } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import { Surface } from "../../components/ui/Surface";
import { KnowledgeModeSurfacePanel } from "./KnowledgeModeSurfacePanel";
import type { KnowledgeOverviewEditableField } from "./knowledgeSectionPayload";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";

export interface KnowledgeOverviewSectionState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly refreshErrorMessage?: string;
  readonly onRetry: () => void;
}

export interface KnowledgeOverviewReferenceStates {
  readonly masters?: Readonly<
    Partial<Record<KnowledgeMasterType, KnowledgeOverviewSectionState>>
  >;
}

export interface KnowledgeOverviewPanelProps {
  readonly overviewPayload: KnowledgeJsonObject;
  readonly masters: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>
  >;
  readonly referenceStates?: KnowledgeOverviewReferenceStates;
  readonly editable: boolean;
  readonly canQuickAdd: boolean;
  readonly onOverviewPayloadChange: (payload: KnowledgeJsonObject) => void;
  readonly onOverviewDirty: (field: KnowledgeOverviewEditableField) => void;
  readonly onQuickAddUom: (select: (master: KnowledgeMaster) => void) => void;
  readonly onQuickAddSurface?: (select: (master: KnowledgeMaster) => void) => void;
  readonly saving?: boolean;
  readonly surfacesDirty?: boolean;
}

export function KnowledgeOverviewPanel({
  overviewPayload,
  masters,
  referenceStates,
  editable,
  canQuickAdd,
  onOverviewPayloadChange,
  onOverviewDirty,
  onQuickAddUom,
  onQuickAddSurface,
  saving = false,
  surfacesDirty = false
}: KnowledgeOverviewPanelProps) {
  const surfaceIds = Array.isArray(overviewPayload.surfaceIds)
    ? overviewPayload.surfaceIds.filter((id): id is string => typeof id === "string")
    : [];
  const surfaceCatalogState = referenceStates?.masters?.surfaces ?? { status: "ready" as const };
  const uomId = stringValue(overviewPayload.uomId);
  const uomOptions = useMemo(
    () => orderedSelectableMasters(masters.uoms ?? [], uomId),
    [masters.uoms, uomId]
  );
  const uomResolved = !uomId || uomOptions.some(({ id }) => id === uomId);
  const uomReferenceState = referenceStates?.masters?.uoms;

  function changeOverviewValue(value: string) {
    onOverviewDirty("uomId");
    const next = { ...overviewPayload } as Record<string, KnowledgeJsonValue>;
    if (value === "") delete next.uomId;
    else next.uomId = value;
    onOverviewPayloadChange(next);
  }

  return (
    <div className="knowledge-overview" aria-label="Main Line Overview">
      <Surface as="section" className="knowledge-overview__section knowledge-overview__section--configured knowledge-overview__configuration-card" aria-labelledby="knowledge-overview-configured-title">
        <div className="knowledge-section-heading">
          <div>
            <h2 id="knowledge-overview-configured-title">UOM</h2>
            <p>Choose the unit used to measure this Main Line.</p>
          </div>
          {!editable ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
        </div>
        <div className="knowledge-overview__configured-grid">
          <div className="knowledge-master-control knowledge-overview__configured-field knowledge-overview__configured-field--uom">
            <Field id="knowledge-overview-uom" label="Unit of measure (UOM)">
              {(props) => (
                <div className="knowledge-overview__uom-control-row">
                  <Select
                    {...props}
                    disabled={!editable || saving || referenceUnavailable(uomReferenceState)}
                    value={uomId}
                    onChange={(event) => changeOverviewValue(event.target.value)}
                  >
                    <option value="">Not configured</option>
                    {!uomResolved ? <option value={uomId}>Unavailable value</option> : null}
                    {uomOptions.map((master) => (
                      <option key={master.id} value={master.id}>{master.name}</option>
                    ))}
                  </Select>
                  {editable && canQuickAdd ? (
                    <Button
                      className="knowledge-overview__quick-add"
                      variant="secondary"
                      leadingIcon={<Plus />}
                      disabled={saving || referenceUnavailable(uomReferenceState)}
                      onClick={() => onQuickAddUom((master) => changeOverviewValue(master.id))}
                    >
                      Add Unit
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
            {uomReferenceState?.status === "loading" ? <p className="knowledge-overview__source-state" role="status">Loading UOM options…</p> : null}
            {uomReferenceState?.status === "error" || uomReferenceState?.refreshErrorMessage ? (
              <div className="knowledge-overview__source-state" role="alert">
                <span>{uomReferenceState.status === "error" ? "UOM options unavailable." : "UOM options may be out of date."}</span>
                <Button size="compact" variant="quiet" onClick={uomReferenceState.onRetry}>Retry UOM</Button>
              </div>
            ) : null}
          </div>
        </div>
      </Surface>

      <Surface as="section" className="knowledge-overview__summary-panel knowledge-overview__configuration-card" aria-label="Surfaces">
        <KnowledgeModeSurfacePanel
          selectedIds={surfaceIds}
          surfaces={masters.surfaces ?? []}
          catalogState={surfaceCatalogState}
          sectionState={{ status: "ready" }}
          readOnly={!editable}
          saving={saving}
          dirty={surfacesDirty}
          canQuickAdd={canQuickAdd && Boolean(onQuickAddSurface)}
          onChange={(nextIds) => {
            onOverviewDirty("surfaceIds");
            onOverviewPayloadChange({ ...overviewPayload, surfaceIds: [...new Set(nextIds)] });
          }}
          onQuickAdd={(select) => onQuickAddSurface?.(select)}
        />
      </Surface>
    </div>
  );
}

function referenceUnavailable(state: KnowledgeOverviewSectionState | undefined) {
  return state !== undefined && state.status !== "ready";
}

function orderedSelectableMasters(masters: readonly KnowledgeMaster[], selectedId: string) {
  return [...masters]
    .filter(({ id, status }) => status === "active" || id === selectedId)
    .sort((left, right) =>
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
}

function stringValue(value: KnowledgeJsonValue | undefined) {
  return typeof value === "string" ? value : "";
}
