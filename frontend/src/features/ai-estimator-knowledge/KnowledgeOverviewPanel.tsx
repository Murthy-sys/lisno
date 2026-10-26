import { Box, Plus } from "lucide-react";
import { useId, useMemo, type RefObject } from "react";
import { applicableKnowledgeTiers, KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { resolveEstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";

import { Button } from "../../components/ui/Button";
import { Field, Radio, Select } from "../../components/ui/Field";
import { Surface } from "../../components/ui/Surface";
import { KnowledgeCardHeading } from "./KnowledgeCardHeading";
import type { KnowledgeProposedMasterChoice } from "./KnowledgeSurfaceMultiSelect";
import { KnowledgeModeSurfacePanel } from "./KnowledgeModeSurfacePanel";
import { KnowledgeOverviewBackdrop, KnowledgeOverviewIcon } from "./KnowledgeOverviewArtwork";
import type { KnowledgeOverviewEditableField } from "./knowledgeSectionPayload";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";
import "./knowledge-overview-table.css";

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
  readonly showDimensions?: boolean;
  readonly showApplicableTiers?: boolean;
  readonly proposedUoms?: readonly KnowledgeProposedMasterChoice[];
  readonly proposedSurfaces?: readonly KnowledgeProposedMasterChoice[];
  readonly quickAddUomLabel?: string;
  readonly proposalActions?: boolean;
  readonly quickAddUomButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly quickAddSurfaceButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly presentation?: "default" | "procurement-basket" | "configuration";
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
  readonly onEditSurface?: (surface: KnowledgeMaster) => void;
  readonly saving?: boolean;
  readonly surfacesDirty?: boolean;
}

export function KnowledgeOverviewPanel({
  showDimensions = false,
  showApplicableTiers = false,
  presentation = "default",
  proposedUoms = [],
  proposedSurfaces = [],
  quickAddUomLabel,
  proposalActions = false,
  quickAddUomButtonRef,
  quickAddSurfaceButtonRef,
  overviewPayload,
  masters,
  referenceStates,
  editable,
  canQuickAdd,
  onOverviewPayloadChange,
  onOverviewDirty,
  onQuickAddUom,
  onQuickAddSurface,
  onEditSurface,
  saving = false,
  surfacesDirty = false
}: KnowledgeOverviewPanelProps) {
  const visibilityId = useId();
  const configuration = presentation === "configuration";
  const settingClassName = `ui-fieldset knowledge-overview__client-visibility${configuration ? " knowledge-overview__setting" : ""}`;
  const choicesClassName = `ui-radio-group${configuration ? " knowledge-overview__choices" : ""}`;
  const clientVisible = overviewPayload.clientVisible !== false;
  const applicableTiers = applicableKnowledgeTiers(overviewPayload);
  const surfaceIds = Array.isArray(overviewPayload.surfaceIds)
    ? overviewPayload.surfaceIds.filter((id): id is string => typeof id === "string")
    : [];
  const surfaceCatalogState = referenceStates?.masters?.surfaces ?? { status: "ready" as const };
  const uomId = stringValue(overviewPayload.uomId);
  const uomOptions = useMemo(
    () => orderedSelectableMasters(masters.uoms ?? [], uomId),
    [masters.uoms, uomId]
  );
  const uomResolved = !uomId || [...uomOptions, ...proposedUoms].some(({ id }) => id === uomId);
  const uomReferenceState = referenceStates?.masters?.uoms;
  const dimensionUom = uomOptions.find(master => master.id === uomId);
  const dimensionRule = dimensionUom ? resolveEstimateDimensionRule(dimensionUom) : null;
  const dimensionsMandatory = overviewPayload.dimensionsMandatory === true;
  const dimensionHelp = dimensionRule
    ? configuration
      ? `If Yes, requires Length, Width and Height in ${dimensionRule.inputUnit}. Quantity = Length × Width in ${dimensionUom!.name}. Height is recorded separately.`
      : `Yes requires Length, Width and Height in ${dimensionRule.inputUnit} from Sales or the client. Quantity = Length × Width in ${dimensionUom!.name}. Height is recorded separately.`
    : "Select a supported area UOM, such as sq-ft or sq-m, to require dimensions. Quantity is calculated as Length × Width.";
  const visibilityCaveat = "No keeps this main line internal on the client estimate screen. It remains included in the total and PDF/quotation.";
  const tierHelp = "Save Overview to update the Mode tabs. Hiding a tier keeps its saved configuration.";

  function changeOverviewValue(value: string) {
    onOverviewDirty("uomId");
    const next = { ...overviewPayload } as Record<string, KnowledgeJsonValue>;
    if (value === "") delete next.uomId;
    else next.uomId = value;
    onOverviewPayloadChange(next);
  }

  return (
    <div className={`knowledge-overview knowledge-overview--surface-table${configuration ? " knowledge-overview--configuration" : ""}`} aria-label="Main Line Overview">
      <Surface as="section" className="knowledge-overview__section knowledge-overview__section--configured knowledge-overview__configuration-card" aria-labelledby="knowledge-overview-configured-title">
        <KnowledgeCardHeading
          icon={configuration ? <KnowledgeOverviewIcon symbol="unit" /> : <Box />}
          titleId="knowledge-overview-configured-title"
          title={presentation === "procurement-basket" ? "Unit of measure" : "UOM"}
          description="Choose the unit used to measure this Main Line."
          trailing={!editable ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
        />
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
                    {proposedUoms.map(master => <option key={master.id} value={master.id}>{master.name} (Proposed)</option>)}
                  </Select>
                  {editable && canQuickAdd ? (
                    <Button
                      ref={quickAddUomButtonRef}
                      className={`knowledge-overview__quick-add${quickAddUomLabel ? " knowledge-overview__quick-add--named" : ""}`}
                      variant="secondary"
                      leadingIcon={quickAddUomLabel ? undefined : configuration ? <KnowledgeOverviewIcon symbol="plus" /> : <Plus />}
                      aria-label={quickAddUomLabel ?? "Add Unit"}
                      title={quickAddUomLabel ?? "Add Unit"}
                      disabled={saving || referenceUnavailable(uomReferenceState)}
                      onClick={() => onQuickAddUom((master) => changeOverviewValue(master.id))}
                    >{quickAddUomLabel}</Button>
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
        <fieldset className={settingClassName} role="radiogroup" disabled={!editable || saving} aria-describedby={`${visibilityId}-help`}>
          <legend>Is this main line needed for the client?</legend>
          {configuration ? <p id={`${visibilityId}-help`} className="knowledge-overview__description">
            {clientVisible ? "Include this main line in the client estimate screen." : visibilityCaveat}
          </p> : null}
          <div className={choicesClassName}>
            {([true, false] as const).map((value) => <label className="knowledge-overview__visibility-option" key={String(value)}>
              <Radio name={`${visibilityId}-client-visible`} value={String(value)} checked={clientVisible === value}
                onChange={() => {
                  if (!editable || saving) return;
                  onOverviewDirty("clientVisible");
                  onOverviewPayloadChange({ ...overviewPayload, clientVisible: value });
                }} />
              {value ? "Yes" : "No"}
            </label>)}
          </div>
          {!configuration ? <p id={`${visibilityId}-help`} className="knowledge-overview__source-state">{visibilityCaveat}</p> : null}
        </fieldset>
        {showDimensions ? <fieldset className={settingClassName} role="radiogroup" disabled={!editable || saving} aria-describedby={configuration ? `${visibilityId}-dimensions-description ${visibilityId}-dimensions-help` : `${visibilityId}-dimensions-help`}>
          <legend>Dimensions mandatory?</legend>
          {configuration ? <p id={`${visibilityId}-dimensions-description`} className="knowledge-overview__description">Require Length, Width and Height from Sales or the client.</p> : null}
          <div className={choicesClassName}>
            {([true, false] as const).map(value => <label className="knowledge-overview__visibility-option" key={String(value)}>
              <Radio name={`${visibilityId}-dimensions-mandatory`} value={String(value)} checked={dimensionsMandatory === value}
                disabled={value && !dimensionRule} onChange={() => {
                  if (!editable || saving || value && !dimensionRule) return;
                  onOverviewDirty("dimensionsMandatory");
                  onOverviewPayloadChange({ ...overviewPayload, dimensionsMandatory: value });
                }} />
              {value ? "Yes" : "No"}
            </label>)}
          </div>
          <p id={`${visibilityId}-dimensions-help`} className={configuration ? "knowledge-overview__dimension-note" : "knowledge-overview__source-state"}>
            {configuration ? <><KnowledgeOverviewIcon symbol="info" /><span>{dimensionHelp}</span></> : dimensionHelp}
          </p>
          {dimensionsMandatory && !dimensionRule ? <p className="knowledge-overview__source-state" role="alert">The saved dimensions setting needs a supported area UOM before it can be used.</p> : null}
        </fieldset> : null}
        {showApplicableTiers ? <fieldset className={settingClassName} disabled={!editable || saving} aria-describedby={`${visibilityId}-tiers-help`}>
          <legend>Applicable tiers</legend>
          {configuration ? <p id={`${visibilityId}-tiers-help`} className="knowledge-overview__description">{tierHelp}</p> : null}
          <div className={`${choicesClassName}${configuration ? " knowledge-overview__choices--tiers" : ""}`}>
            {KNOWLEDGE_MODE_TIERS.map(tier => <label className="knowledge-overview__visibility-option" key={tier}>
              <input type="checkbox" checked={applicableTiers.includes(tier)} onChange={event => {
                if (!editable || saving) return;
                const selected = new Set(applicableTiers);
                if (event.target.checked) selected.add(tier); else selected.delete(tier);
                onOverviewDirty("applicableTiers");
                onOverviewPayloadChange({ ...overviewPayload, applicableTiers: KNOWLEDGE_MODE_TIERS.filter(value => selected.has(value)) });
              }} />
              {KNOWLEDGE_MODE_TIER_LABELS[tier]}
            </label>)}
          </div>
          {!configuration ? <p id={`${visibilityId}-tiers-help`} className="knowledge-overview__source-state">{tierHelp}</p> : null}
        </fieldset> : null}
      </Surface>

      <Surface as="section" className="knowledge-overview__summary-panel knowledge-overview__configuration-card" aria-label={presentation === "procurement-basket" ? "Applicable surfaces" : "Surfaces"}>
        <KnowledgeModeSurfacePanel
          presentation={presentation === "configuration" ? "configuration" : presentation === "procurement-basket" ? "procurement-basket" : "overview"}
          selectedIds={surfaceIds}
          surfaces={masters.surfaces ?? []}
          proposedSurfaces={proposedSurfaces}
          proposalActions={proposalActions}
          quickAddButtonRef={quickAddSurfaceButtonRef}
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
          onEditSurface={onEditSurface}
        />
      </Surface>
      {configuration ? <KnowledgeOverviewBackdrop /> : null}
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
