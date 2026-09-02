import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Radio, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatKnowledgePercentage
} from "./knowledgePresentation";
import {
  KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
  type KnowledgeOverviewModeDetail,
  type KnowledgeOverviewModeRecoveryDetail,
  type KnowledgeOverviewPriceDetail,
  type KnowledgeOverviewSummary
} from "./knowledgeOverviewSummary";
import {
  isChoiceField,
  knowledgeModeFieldTypeLabel,
  type KnowledgeModeFieldSummary
} from "./knowledgeModeConfiguration";
import type { KnowledgeOverviewEditableField } from "./knowledgeSectionPayload";
import type {
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeRevision,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import type { KnowledgeWorkspaceSectionKey } from "./knowledgeWorkspaceSections";

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
  readonly relationships?: KnowledgeOverviewSectionState;
}

export interface KnowledgeOverviewPanelProps {
  readonly item: KnowledgeItemDetail;
  readonly revision: KnowledgeRevision;
  readonly overviewPayload: KnowledgeJsonObject;
  readonly summary: KnowledgeOverviewSummary;
  readonly masters: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>
  >;
  readonly sectionStates: Readonly<
    Partial<Record<KnowledgeSectionKey, KnowledgeOverviewSectionState>>
  >;
  readonly referenceStates?: KnowledgeOverviewReferenceStates;
  readonly editable: boolean;
  readonly canQuickAdd: boolean;
  readonly onOverviewPayloadChange: (payload: KnowledgeJsonObject) => void;
  readonly onOverviewDirty: (field: KnowledgeOverviewEditableField) => void;
  readonly onQuickAddUom: (select: (master: KnowledgeMaster) => void) => void;
  readonly onOpenSection: (section: KnowledgeWorkspaceSectionKey) => void;
}

export function KnowledgeOverviewPanel({
  item,
  overviewPayload,
  summary,
  masters,
  sectionStates,
  referenceStates,
  editable,
  canQuickAdd,
  onOverviewPayloadChange,
  onOverviewDirty,
  onQuickAddUom,
  onOpenSection
}: KnowledgeOverviewPanelProps) {
  const [selectedModeId, setSelectedModeId] = useState("");
  const [selectedSpecificationId, setSelectedSpecificationId] = useState("");
  const [selectedRecommendationId, setSelectedRecommendationId] = useState("");

  const currentModeId = retainedSelection(selectedModeId, summary.modeOptions);
  const currentSpecificationId = retainedSelection(
    selectedSpecificationId,
    summary.specificationOptions
  );
  const currentRecommendationId = retainedSelection(
    selectedRecommendationId,
    summary.recommendationOptions
  );

  useEffect(() => {
    if (currentModeId !== selectedModeId) setSelectedModeId(currentModeId);
  }, [currentModeId, selectedModeId]);
  useEffect(() => {
    if (currentSpecificationId !== selectedSpecificationId) {
      setSelectedSpecificationId(currentSpecificationId);
    }
  }, [currentSpecificationId, selectedSpecificationId]);
  useEffect(() => {
    if (currentRecommendationId !== selectedRecommendationId) {
      setSelectedRecommendationId(currentRecommendationId);
    }
  }, [currentRecommendationId, selectedRecommendationId]);

  const selectedMode = summary.modeDetails.find(
    ({ option }) => option.id === currentModeId
  );
  const selectedSpecification = summary.specificationDetails.find(
    ({ option }) => option.id === currentSpecificationId
  );
  const selectedRecommendation = summary.recommendationDetails.find(
    ({ option }) => option.id === currentRecommendationId
  );
  const uomId = stringValue(overviewPayload.uomId);
  const uomOptions = useMemo(
    () => orderedSelectableMasters(masters.uoms ?? [], uomId),
    [masters.uoms, uomId]
  );
  const uomResolved = !uomId || uomOptions.some(({ id }) => id === uomId);
  const uomReferenceState = referenceStates?.masters?.uoms;
  const legacyModeReferenceState = summary.legacyModeMappingRequired
    ? referenceStates?.masters?.modes
    : undefined;
  const modeSourceKeys = ["advanced"] as const;
  const modeSourceAttention = sourcesNeedAttention(modeSourceKeys, sectionStates);
  const savedReferenceSources = uniqueSources([
    ...(summary.priceDetails.length
      ? [referenceStates?.masters?.vendors]
      : []),
    ...(summary.recommendationOptions.length
      ? [referenceStates?.relationships]
      : [])
  ]);
  const relevantReferenceSources = uniqueSources([
    uomReferenceState,
    ...savedReferenceSources
  ]);
  const loadingSavedReferenceSources = uniqueSources([
    ...(summary.priceDetails.length
      ? [referenceStates?.masters?.vendors]
      : []),
    ...(summary.recommendationOptions.length
      ? [referenceStates?.relationships]
      : [])
  ]).filter(({ status }) => status === "loading");
  const failedReferenceSources = relevantReferenceSources.filter(
    ({ status, refreshErrorMessage }) =>
      status === "error" || Boolean(refreshErrorMessage)
  );
  const modesVisible =
    summary.modeOptions.length > 0 ||
    summary.modeRecoveryDetails.length > 0 ||
    modeSourceAttention;
  const modePickerVisible = summary.modeOptions.length > 0;
  const sharedValuesVisible =
    summary.hasSharedQuantityMargin ||
    sourcesNeedAttention(["quantity-margin"], sectionStates);
  const pricingSourceAttention = sourcesNeedAttention(["pricing"], sectionStates);
  const specificationsVisible =
    summary.specificationOptions.length > 0 ||
    (pricingSourceAttention && summary.priceDetails.length === 0);
  const pricingVisible = summary.priceDetails.length > 0;
  const recommendationsVisible =
    summary.recommendationOptions.length > 0 ||
    sourcesNeedAttention(["recommendations"], sectionStates);
  const qualityVisible =
    summary.qualityDetails.length > 0 ||
    sourcesNeedAttention(["quality"], sectionStates);
  function changeOverviewValue(value: KnowledgeJsonValue) {
    onOverviewDirty("uomId");
    const next = { ...overviewPayload } as Record<string, KnowledgeJsonValue>;
    if (value === "") delete next.uomId;
    else next.uomId = value;
    onOverviewPayloadChange(next);
  }

  return (
    <div className="knowledge-overview" aria-label="Main Line Overview">
      {failedReferenceSources.length ? (
        <InlineMessage
          tone="warning"
          title="Some reusable labels are unavailable"
          action={<Button size="compact" variant="quiet" onClick={() => failedReferenceSources.forEach(({ onRetry }) => onRetry())}>Try again</Button>}
        >
          Existing unresolved selections are shown as Unavailable value. Other section summaries remain available.
        </InlineMessage>
      ) : null}
      {loadingSavedReferenceSources.length ? (
        <p className="knowledge-overview__source-state" role="status">
          Loading reusable labels…
        </p>
      ) : null}
      <p className="knowledge-overview__context">
        <strong className="knowledge-overview__context-main-line">{item.mainLineName}</strong>
        <span className="knowledge-overview__context-separator" aria-hidden="true"> · </span>
        <span className="knowledge-overview__context-basket">
          Main Basket: <strong>{item.basketName}</strong>
        </span>
      </p>

      <section className="knowledge-overview__section knowledge-overview__section--configured" aria-labelledby="knowledge-overview-configured-title">
        <div className="knowledge-section-heading">
          <div>
            <h2 id="knowledge-overview-configured-title">Configured values</h2>
            <p>Reusable values for this Main Line.</p>
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
                    disabled={!editable || referenceUnavailable(uomReferenceState)}
                    value={uomId}
                    onChange={(event) => changeOverviewValue(event.target.value)}
                  >
                    <option value="">Not configured</option>
                    {!uomResolved ? (
                      <option value={uomId}>{KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL}</option>
                    ) : null}
                    {uomOptions.map((master) => (
                      <option key={master.id} value={master.id}>{master.name}</option>
                    ))}
                  </Select>
                  {editable && canQuickAdd ? (
                    <Button
                      className="knowledge-overview__quick-add"
                      size="compact"
                      variant="quiet"
                      leadingIcon={<Plus />}
                      disabled={referenceUnavailable(uomReferenceState)}
                      onClick={() => onQuickAddUom((master) => changeOverviewValue(master.id))}
                    >
                      Add Unit
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
            {uomReferenceState?.status === "loading" ? <p className="knowledge-overview__source-state" role="status">Loading UOM options…</p> : null}
            {uomReferenceState?.status === "error" ? <p className="knowledge-overview__source-state" role="alert">UOM options unavailable.</p> : null}
          </div>
        </div>

        {modePickerVisible ? (
          <fieldset className="knowledge-overview__modes">
            <legend>Modes</legend>
            {summary.modeOptions.length ? (
              <div className="knowledge-overview__radio-list" role="radiogroup" aria-label="Modes">
                {summary.modeOptions.map((mode) => (
                  <label key={mode.id} className="knowledge-overview__radio-option">
                    <Radio
                      name="knowledge-overview-mode"
                      value={mode.id}
                      checked={currentModeId === mode.id}
                      onChange={() => setSelectedModeId(mode.id)}
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        ) : null}
      </section>

      {modesVisible || sharedValuesVisible || specificationsVisible || pricingVisible || recommendationsVisible || qualityVisible ? (
        <div className="knowledge-overview__principal-grid">
        {modesVisible ? (
          <Surface as="section" className="knowledge-overview__summary-panel" aria-labelledby="knowledge-overview-mode-details-title">
          <SummaryHeading
            id="knowledge-overview-mode-details-title"
            title="Selected Mode details"
            actionLabel="Open Mode"
            onAction={() => onOpenSection("mode")}
          />
          <SourceBoundary
            keys={modeSourceKeys}
            states={sectionStates}
          >
            <ModeDetails detail={selectedMode} />
            {summary.legacyModeMappingRequired && (
              legacyModeReferenceState?.status === "loading" ||
              legacyModeReferenceState?.refreshing
            ) ? (
              <p className="knowledge-overview__source-state" role="status">
                Checking saved Mode configuration mapping…
              </p>
            ) : null}
            {summary.legacyModeMappingRequired && legacyModeReferenceState && (
              legacyModeReferenceState.status === "error" ||
              legacyModeReferenceState.refreshErrorMessage
            ) ? (
              <InlineMessage
                tone="warning"
                role="status"
                title="Saved Mode configuration mapping is unavailable"
                action={<Button size="compact" variant="quiet" onClick={legacyModeReferenceState.onRetry}>Try again</Button>}
              >
                {legacyModeReferenceState.errorMessage ?? legacyModeReferenceState.refreshErrorMessage ?? "Saved fields could not be matched to PMC or Execution."}
              </InlineMessage>
            ) : null}
            <ModeRecoveryDetails details={summary.modeRecoveryDetails} />
          </SourceBoundary>
          </Surface>
        ) : null}

        {sharedValuesVisible ? (
          <Surface as="section" variant="subtle" className="knowledge-overview__summary-panel" aria-labelledby="knowledge-overview-shared-values-title">
          <SummaryHeading id="knowledge-overview-shared-values-title" title="Shared calculation values" />
          <p className="knowledge-overview__supporting-copy">These values apply across Modes and are not attributed to the selected Mode.</p>
          <SourceBoundary keys={["quantity-margin"]} states={sectionStates}>
            <DefinitionList
              definitions={[
                { label: "Start margin", value: formatBps(summary.sharedQuantityMargin.startMarginBps) },
                { label: "Bottom margin", value: formatBps(summary.sharedQuantityMargin.bottomMarginBps) },
                { label: "PMC markup", value: formatBps(summary.sharedQuantityMargin.pmcMarkupBps) },
                { label: "Wastage", value: formatBps(summary.sharedQuantityMargin.wastageBps) },
                { label: "Gap behavior", value: displayText(summary.sharedQuantityMargin.gapBehavior) },
                {
                  label: "Quantity slabs",
                  value: summary.sharedQuantityMargin.quantitySlabs.length + summary.sharedQuantityMargin.slabRateCount > 0
                    ? String(summary.sharedQuantityMargin.quantitySlabs.length + summary.sharedQuantityMargin.slabRateCount)
                    : null
                }
              ]}
            />
          </SourceBoundary>
          </Surface>
        ) : null}

        {specificationsVisible ? (
          <Surface as="section" className="knowledge-overview__summary-panel" aria-labelledby="knowledge-overview-specifications-title">
          <SummaryHeading
            id="knowledge-overview-specifications-title"
            title="Specifications"
            actionLabel="Open Mode"
            onAction={() => onOpenSection("mode")}
          />
          <SourceBoundary
            keys={["pricing"]}
            states={sectionStates}
          >
            {summary.specificationOptions.length ? (
              <>
                <Field id="knowledge-overview-specification" label="Specification">
                  {(props) => (
                    <Select
                      {...props}
                      value={currentSpecificationId}
                      onChange={(event) => setSelectedSpecificationId(event.target.value)}
                    >
                      {summary.specificationOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                {selectedSpecification ? (
                  <div className="knowledge-overview__detail" aria-live="polite">
                    <DefinitionList
                      definitions={[
                        {
                          label: "Specification name",
                          value: selectedSpecification.option.label
                        },
                        {
                          label: "Brief description",
                          value: displayText(selectedSpecification.description)
                        }
                      ]}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </SourceBoundary>
          </Surface>
        ) : null}

        {pricingVisible ? (
          <Surface as="section" className="knowledge-overview__summary-panel" aria-labelledby="knowledge-overview-pricing-title">
          <SummaryHeading
            id="knowledge-overview-pricing-title"
            title="Budgeting"
            actionLabel="Open Mode"
            onAction={() => onOpenSection("mode")}
          />
          <SourceBoundary
            keys={["pricing"]}
            states={sectionStates}
          >
            <PriceList title={null} prices={summary.priceDetails} />
          </SourceBoundary>
          </Surface>
        ) : null}

        {recommendationsVisible ? (
          <Surface as="section" className="knowledge-overview__summary-panel" aria-labelledby="knowledge-overview-recommendations-title">
          <SummaryHeading
            id="knowledge-overview-recommendations-title"
            title="Recommendations"
            actionLabel="Open Recommendations"
            onAction={() => onOpenSection("recommendations")}
          />
          <SourceBoundary
            keys={["recommendations"]}
            states={sectionStates}
          >
            {summary.recommendationOptions.length ? (
              <>
                <Field id="knowledge-overview-recommendation" label="Recommendation">
                  {(props) => (
                    <Select
                      {...props}
                      value={currentRecommendationId}
                      onChange={(event) => setSelectedRecommendationId(event.target.value)}
                    >
                      {summary.recommendationOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                {selectedRecommendation ? (
                  <DefinitionList
                    ariaLive="polite"
                    definitions={[
                      { label: "Target Main Basket", value: referenceLabel(selectedRecommendation.targetBasket) },
                      { label: "Target Main Line", value: referenceLabel(selectedRecommendation.targetMainLine) },
                      { label: "Type", value: displayText(selectedRecommendation.type) },
                      { label: "Reason", value: displayText(selectedRecommendation.reason) },
                      { label: "Quantity relationship", value: displayText(selectedRecommendation.quantityRelationship) },
                      { label: "Quantity value", value: displayText(selectedRecommendation.quantityValue) },
                      { label: "Dependency", value: formatBoolean(selectedRecommendation.dependency) },
                      { label: "Active", value: formatBoolean(selectedRecommendation.active) }
                    ]}
                  />
                ) : null}
              </>
            ) : null}
          </SourceBoundary>
          </Surface>
        ) : null}

        {qualityVisible ? (
          <Surface as="section" className="knowledge-overview__summary-panel knowledge-overview__summary-panel--wide" aria-labelledby="knowledge-overview-quality-title">
          <SummaryHeading
            id="knowledge-overview-quality-title"
            title="Quality"
            actionLabel="Open Quality"
            onAction={() => onOpenSection("quality")}
          />
          <SourceBoundary keys={["quality"]} states={sectionStates}>
            {summary.qualityDetails.length ? (
              <ul className="knowledge-overview__quality-list">
                {summary.qualityDetails.map((parameter) => (
                  <li key={parameter.id}>
                    <div className="knowledge-overview__quality-title">
                      <strong>{parameter.label}</strong>
                      <div>
                        {parameter.required !== null ? <StatusBadge label={parameter.required ? "Required" : "Optional"} tone={parameter.required ? "info" : "neutral"} /> : null}
                        {parameter.active !== null ? <StatusBadge label={parameter.active ? "Active" : "Inactive"} tone={parameter.active ? "success" : "neutral"} /> : null}
                      </div>
                    </div>
                    <DefinitionList
                      definitions={[
                        { label: "Type", value: displayText(parameter.type) },
                        { label: "Unit", value: displayText(parameter.unit) },
                        { label: "Range", value: formatRange(parameter.minimum, parameter.maximum) },
                        { label: "Allowed values", value: parameter.allowedValues.length ? parameter.allowedValues.join(", ") : null },
                        { label: "Default", value: formatJsonValue(parameter.defaultValue) }
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </SourceBoundary>
          </Surface>
        ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryHeading({ id, title, actionLabel, onAction }: {
  readonly id: string;
  readonly title: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  return (
    <div className="knowledge-overview__summary-heading">
      <h2 id={id}>{title}</h2>
      {actionLabel && onAction ? (
        <Button size="compact" variant="quiet" trailingIcon={<ArrowRight />} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ModeDetails({ detail }: { readonly detail: KnowledgeOverviewModeDetail | undefined }) {
  if (!detail) return null;
  const visibleOverrides = detail.overrides.filter(
    (override) => displayText(override.description) !== null || override.active !== null
  );

  return (
    <div className="knowledge-overview__detail" aria-live="polite">
      <div className="knowledge-overview__mode-title">
        <h3>{detail.option.label}</h3>
        {detail.configured ? <StatusBadge label="Configured" tone="success" /> : null}
      </div>
      <DefinitionList
        definitions={[
          { label: "Referenced by Overview", value: detail.referencedByOverview ? "Yes" : null },
          { label: "Referenced by Scope", value: detail.referencedByScope ? "Yes" : null },
          { label: "Matching budgets", value: detail.prices.length > 0 ? String(detail.prices.length) : null },
          { label: "Advanced overrides", value: detail.overrides.length > 0 ? String(detail.overrides.length) : null }
        ]}
      />
      {detail.dynamicFields.length ? (
        <div className="knowledge-overview__subsection knowledge-overview__mode-fields">
          <h4>PMC components</h4>
          <ModeComponentDefinitions fields={detail.dynamicFields} />
        </div>
      ) : null}
      {detail.executionSources.map((source) => (
        <div
          key={source.source}
          className="knowledge-overview__subsection knowledge-overview__mode-fields"
        >
          <h4>{source.label}</h4>
          <ModeComponentDefinitions fields={source.dynamicFields} />
        </div>
      ))}
      {detail.prices.length ? <PriceList prices={detail.prices} /> : null}
      {visibleOverrides.length ? (
        <div className="knowledge-overview__subsection">
          <h4>Advanced Mode overrides</h4>
          <ul>
            {visibleOverrides.map((override) => (
              <li key={override.id}>
                {displayText(override.description) ? <span>{displayText(override.description)}</span> : null}
                {override.active !== null ? <StatusBadge label={override.active ? "Active" : "Inactive"} tone={override.active ? "success" : "neutral"} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ModeRecoveryDetails({
  details
}: {
  readonly details: readonly KnowledgeOverviewModeRecoveryDetail[];
}) {
  if (!details.length) return null;
  return (
    <div className="knowledge-overview__subsection" aria-label="Saved Mode configuration recovery">
      <h3>Saved Mode information needing recovery</h3>
      {details.map((detail) => (
        <div key={detail.key}>
          <h4>{detail.label}</h4>
          <p>
            {detail.state === "collision"
              ? "A canonical configuration is shown above; this separate saved configuration was not merged."
              : "This saved configuration could not be matched safely to PMC or Execution."}
          </p>
          {detail.dynamicFields.length ? (
            <ModeComponentDefinitions fields={detail.dynamicFields} />
          ) : <p>No configured component definitions are available.</p>}
        </div>
      ))}
    </div>
  );
}

function ModeComponentDefinitions({
  fields
}: {
  readonly fields: readonly KnowledgeModeFieldSummary[];
}) {
  return (
    <ul className="knowledge-overview__mode-component-list">
      {fields.map((field) => (
        <li key={field.id}>
          <h5>{field.label}</h5>
          <DefinitionList
            definitions={[
              {
                label: "Component type",
                value: knowledgeModeFieldTypeLabel(field.type)
              },
              {
                label: "Allowed options",
                value: isChoiceField(field.type) && field.options.length
                  ? field.options.join(", ")
                  : null
              }
            ]}
          />
        </li>
      ))}
    </ul>
  );
}

function PriceList({ prices, title = "Budgets" }: {
  readonly prices: readonly KnowledgeOverviewPriceDetail[];
  readonly title?: string | null;
}) {
  return (
    <div className="knowledge-overview__subsection">
      {title ? <h3>{title}</h3> : null}
      <ul className="knowledge-overview__price-list">
        {prices.map((price) => {
          const definitions = priceDefinitions(price);
          return (
            <li key={price.id}>
              {definitions.some(({ value }) => hasDisplayValue(value)) ? (
                <DefinitionList definitions={definitions} />
              ) : (
                <p>{KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function priceDefinitions(price: KnowledgeOverviewPriceDetail): readonly DefinitionEntry[] {
  return [
    { label: "Vendor", value: referenceLabel(price.vendor) },
    { label: "Unit of measure", value: referenceLabel(price.uom) },
    { label: "Amount before GST", value: formatPaise(price.baseAmountPaise) },
    { label: "GST", value: formatPaise(price.taxAmountPaise) },
    { label: "Total including GST", value: formatPaise(price.totalAmountPaise) },
    { label: "Starts on", value: formatDateTime(price.effectiveFrom) },
    { label: "Ends on", value: formatDateTime(price.effectiveTo) },
    {
      label: "Review",
      value: price.reviewRequired === true || (price.status !== null && price.status !== "active")
        ? "Needs review"
        : null
    }
  ];
}

function SourceBoundary({ keys, states, children }: {
  readonly keys: readonly KnowledgeSectionKey[];
  readonly states: KnowledgeOverviewPanelProps["sectionStates"];
  readonly children: React.ReactNode;
}) {
  const sources = keys
    .map((key) => states[key])
    .filter(Boolean) as KnowledgeOverviewSectionState[];
  const errors = sources.filter(({ status }) => status === "error");
  const loading = sources.some(({ status }) => status === "loading");
  const refreshing = sources.some(({ refreshing }) => refreshing);
  const refreshFailures = sources.filter(({ refreshErrorMessage }) => Boolean(refreshErrorMessage));

  if (errors.length) {
    return (
      <InlineMessage
        tone="error"
        role="alert"
        title="Summary unavailable"
        action={<Button
          size="compact"
          variant="quiet"
          leadingIcon={<RefreshCw />}
          onClick={() => errors.forEach(({ onRetry }) => onRetry())}
        >
          Try again
        </Button>}
      >
        <span>{errors[0]?.errorMessage ?? "This section summary could not be loaded."}</span>
      </InlineMessage>
    );
  }
  if (loading) return <p className="knowledge-overview__source-state" role="status">Loading…</p>;

  return (
    <>
      {refreshFailures.length ? (
        <InlineMessage
          tone="warning"
          title="Showing cached summary"
          action={<Button size="compact" variant="quiet" leadingIcon={<RefreshCw />} onClick={() => refreshFailures.forEach(({ onRetry }) => onRetry())}>Try again</Button>}
        >
          {refreshFailures[0]?.refreshErrorMessage ?? "The latest values could not be loaded."}
        </InlineMessage>
      ) : null}
      {refreshing ? <p className="knowledge-overview__refreshing" role="status">Refreshing…</p> : null}
      {children}
    </>
  );
}

interface DefinitionEntry {
  readonly label: string;
  readonly value: string | null | undefined;
}

function DefinitionList({
  definitions,
  className = "knowledge-overview__definition-grid",
  ariaLive
}: {
  readonly definitions: readonly DefinitionEntry[];
  readonly className?: string;
  readonly ariaLive?: "off" | "polite" | "assertive";
}) {
  const visibleDefinitions = definitions.filter(
    (definition): definition is { readonly label: string; readonly value: string } =>
      hasDisplayValue(definition.value)
  );
  if (!visibleDefinitions.length) return null;

  return (
    <dl className={className} aria-live={ariaLive}>
      {visibleDefinitions.map(({ label, value }) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function retainedSelection(
  selectedId: string,
  options: readonly { readonly id: string }[]
) {
  return options.some(({ id }) => id === selectedId) ? selectedId : options[0]?.id ?? "";
}

function sourceNeedsAttention(state: KnowledgeOverviewSectionState | undefined) {
  return Boolean(
    state &&
    (state.status !== "ready" || state.refreshing || state.refreshErrorMessage)
  );
}

function sourcesNeedAttention(
  keys: readonly KnowledgeSectionKey[],
  states: KnowledgeOverviewPanelProps["sectionStates"]
) {
  return keys.some((key) => sourceNeedsAttention(states[key]));
}

function uniqueSources(
  sources: readonly (KnowledgeOverviewSectionState | undefined)[]
) {
  return [...new Set(sources.filter(Boolean) as KnowledgeOverviewSectionState[])];
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

function displayText(value: string | null) {
  return value?.trim() || null;
}

function formatBoolean(value: boolean | null) {
  return value === null ? null : value ? "Yes" : "No";
}

function formatPaise(value: number | null) {
  return value === null ? null : formatKnowledgeMoney(value);
}

function formatBps(value: number | null) {
  return value === null ? null : formatKnowledgePercentage(value);
}

function formatDateTime(value: string | null) {
  return value ? formatKnowledgeDateTime(value) : null;
}

function formatRange(minimum: string | null, maximum: string | null) {
  const normalizedMinimum = minimum?.trim() || null;
  const normalizedMaximum = maximum?.trim() || null;
  if (normalizedMinimum && normalizedMaximum) {
    return `${normalizedMinimum} – ${normalizedMaximum}`;
  }
  if (normalizedMinimum) return `Minimum ${normalizedMinimum}`;
  if (normalizedMaximum) return `Maximum ${normalizedMaximum}`;
  return null;
}

function formatJsonValue(value: KnowledgeJsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const values = value.map(formatJsonValue).filter(hasDisplayValue);
    return values.length ? values.join(", ") : null;
  }
  if (typeof value === "object") {
    return Object.values(value).some((entry) => formatJsonValue(entry) !== null)
      ? "Configured"
      : null;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function referenceLabel(
  reference: { readonly id: string; readonly label: string } | null | undefined
) {
  return reference?.id ? reference.label : null;
}

function hasDisplayValue(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
