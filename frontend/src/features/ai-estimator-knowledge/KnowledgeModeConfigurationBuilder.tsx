import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ClipboardCheck, HardHat, Users, Wrench } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  KNOWLEDGE_EXECUTION_SOURCE_OPTIONS,
  KNOWLEDGE_MODE_OPTIONS,
  createKnowledgeModeConfiguration,
  isChoiceField,
  knowledgeModeFieldTypeLabel,
  knowledgeModeFieldValueLabel,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations,
  withKnowledgeModeConfigurations,
  type KnowledgeExecutionSource,
  type KnowledgeModeConfiguration,
  type KnowledgeModeConfigurationField,
  type KnowledgeModeConfigurationIssue,
  type KnowledgeModeKind
} from "./knowledgeModeConfiguration";
import { KnowledgePmcScopeChecklist } from "./KnowledgePmcScopeChecklist";
import { KnowledgeModeDescriptionEditor } from "./KnowledgeModeDescriptionEditor";
import { generateModeDescription, modeDescriptionIssues, syncModeDescription } from "./knowledgeModeDescription";
import { calculationScopeForIssue, MODE_CALCULATION_SCOPES, modeCalculationIssues, modeCalculationsIssues, type ModeCalculationScope } from "./knowledgeModeCalculation";
import { pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues, withPmcMargin, withSubVendorMargin } from "./knowledgePmcMargin";
import { KnowledgePmcMarginRange, KnowledgeSubVendorMarginRange } from "./KnowledgePmcMarginInput";
import { inHouseScopeStarterItems, PMC_SCOPE_LISTS, type KnowledgePmcScopeList } from "./knowledgePmcScope";
import type {
  KnowledgeJsonObject,
  KnowledgeMaster
} from "./knowledgeTypes";

export interface KnowledgeModeConfigurationBuilderProps {
  readonly payload: KnowledgeJsonObject;
  readonly mainLineName: string;
  readonly calculation?: (scope: ModeCalculationScope, active: boolean, marginControl?: ReactNode) => ReactNode;
  readonly inHouseTotal?: (active: boolean) => ReactNode;
  readonly calculationValidity?: Readonly<Record<ModeCalculationScope, boolean>>;
  readonly descriptionResetKey?: string;
  readonly onPendingDescriptionChange?: (pending: boolean) => void;
  readonly onPendingDescriptionTextChange?: (text: string | null) => void;
  readonly modes: readonly KnowledgeMaster[];
  readonly legacyModeCatalogState?: KnowledgeLegacyModeCatalogState;
  readonly serverIssues?: readonly KnowledgeModeConfigurationIssue[];
  readonly readOnly: boolean;
  readonly validationAttempt: number;
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly onDirty: () => void;
  readonly onValidationChange: (valid: boolean) => void;
}

export interface KnowledgeLegacyModeCatalogState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
}

export function KnowledgeModeConfigurationBuilder({
  payload,
  mainLineName,
  calculation,
  inHouseTotal,
  calculationValidity = { pmc: true, sub_vendor: true, in_house_labor: true, in_house_material: true },
  descriptionResetKey = "default",
  onPendingDescriptionChange = ignorePendingDescription,
  onPendingDescriptionTextChange,
  modes,
  legacyModeCatalogState = { status: "ready" },
  serverIssues = [],
  readOnly,
  validationAttempt,
  onChange,
  onDirty,
  onValidationChange
}: KnowledgeModeConfigurationBuilderProps) {
  const parsed = useMemo(
    () => parseKnowledgeModeConfigurations(payload.modeConfigurations, modes),
    [modes, payload.modeConfigurations]
  );
  const partitioned = useMemo(
    () => partitionKnowledgeModeConfigurations(parsed.configurations),
    [parsed.configurations]
  );
  const inHouseConfiguration = partitioned.primary.execution.in_house;
  const generatedDescription = generateModeDescription(mainLineName, partitioned.primary.pmc, inHouseConfiguration);
  const description = typeof payload.modeDescription === "string"
    ? syncModeDescription(payload.modeDescription, partitioned.primary.pmc, undefined, inHouseConfiguration) : generatedDescription;
  const issues = useMemo(
    () => [...parsed.issues, ...modeDescriptionIssues(payload.modeDescription == null || typeof payload.modeDescription === "string" ? description : payload.modeDescription), ...modeCalculationsIssues(payload), ...pmcMarginRangeIssues(payload), ...subVendorMarginRangeIssues(payload), ...serverIssues],
    [parsed.issues, description, payload, serverIssues]
  );
  const recoveries = [
    ...partitioned.recovery,
    ...parsed.configurations.flatMap((configuration, index) => {
      const fieldPath = `modeConfigurations.${index}.fields`;
      const isPrimaryExecution = configuration === partitioned.primary.execution.sub_vendor ||
        configuration === partitioned.primary.execution.in_house;
      return isPrimaryExecution && issues.some(({ path }) => path === fieldPath || path.startsWith(`${fieldPath}.`))
        ? [{ configuration, reason: "invalid_fields" as const, modeKind: configuration.modeKind,
          executionSource: configuration.executionSource }]
        : [];
    })
  ];
  const [paragraphPending, setParagraphPending] = useState(false);
  const handlePendingDescriptionChange = useCallback((pending: boolean) => {
    setParagraphPending(pending);
    onPendingDescriptionChange(pending);
  }, [onPendingDescriptionChange]);
  const initialSelection = modeSelectionForPayload(payload, parsed.configurations);
  const [visibleModes, setVisibleModes] = useState<Record<KnowledgeModeKind, boolean>>(initialSelection.modes);
  const [expandedModes, setExpandedModes] = useState<Record<KnowledgeModeKind, boolean>>({
    pmc: true,
    execution: true
  });
  const showMode = useCallback((mode: KnowledgeModeKind) => {
    setVisibleModes((current) => ({ ...current, [mode]: true }));
    setExpandedModes((current) => ({ ...current, [mode]: true }));
  }, []);
  const [visibleExecutionSources, setVisibleExecutionSources] = useState<Record<KnowledgeExecutionSource, boolean>>(initialSelection.executionSources);
  const [expandedExecutionSources, setExpandedExecutionSources] = useState<Record<KnowledgeExecutionSource, boolean>>({
    sub_vendor: true,
    in_house: true
  });
  const showExecutionSource = useCallback((source: KnowledgeExecutionSource) => {
    showMode("execution");
    setVisibleExecutionSources((current) => ({ ...current, [source]: true }));
    setExpandedExecutionSources((current) => ({ ...current, [source]: true }));
  }, [showMode]);
  const selectionResetKey = useRef(descriptionResetKey);
  useEffect(() => {
    if (selectionResetKey.current === descriptionResetKey) return;
    selectionResetKey.current = descriptionResetKey;
    const selection = modeSelectionForPayload(payload, parsed.configurations);
    setVisibleModes(selection.modes);
    setVisibleExecutionSources(selection.executionSources);
    setExpandedModes({ pmc: true, execution: true });
    setExpandedExecutionSources({ sub_vendor: true, in_house: true });
  // Re-evaluate only when the parent changes item/revision or explicitly resets the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptionResetKey]);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef(new Map<string, HTMLElement>());
  const lastValidationAttempt = useRef(0);
  const selectedSourceLabel = KNOWLEDGE_EXECUTION_SOURCE_OPTIONS
    .filter(({ executionSource }) => visibleExecutionSources[executionSource])
    .map(({ label }) => label).join(" + ");
  const showSubVendorScope = visibleModes.execution && visibleExecutionSources.sub_vendor;
  const invalidCalculationScope = MODE_CALCULATION_SCOPES.find((scope) => !calculationValidity[scope]);
  const calculationValid = invalidCalculationScope === undefined;

  useEffect(() => {
    onValidationChange(issues.length === 0 && !paragraphPending && calculationValid);
  }, [issues.length, onValidationChange, paragraphPending, calculationValid]);
  useEffect(() => {
    if (validationAttempt === 0) {
      lastValidationAttempt.current = 0;
      return;
    }
    if (validationAttempt <= lastValidationAttempt.current || (!issues.length && !paragraphPending && calculationValid)) return;
    lastValidationAttempt.current = validationAttempt;
    if ((paragraphPending || issues[0]?.path === "modeDescription") && !visibleModes.pmc && !visibleModes.execution) showMode("pmc");
    const firstIssue = paragraphPending ? { path: "modeDescription", message: "Save or cancel the paragraph." }
      : invalidCalculationScope ? { path: `modeCalculations.${invalidCalculationScope}`, message: "Review the calculation inputs." } : issues[0]!;
    if (firstIssue.path === "pmcMarginBps" || firstIssue.path === "pmcMinimumMarginBps") showMode("pmc");
    selectConfigurationForIssue(
      firstIssue,
      parsed.configurations,
      showMode,
      showExecutionSource
    );
    globalThis.setTimeout(() => {
      focusIssue(firstIssue, fieldRefs.current, validationSummaryRef.current);
    }, 0);
  }, [issues, paragraphPending, calculationValid, invalidCalculationScope, parsed.configurations, showMode, showExecutionSource, validationAttempt, visibleModes]);

  function updateConfigurations(next: readonly KnowledgeModeConfiguration[]) {
    onDirty();
    const nextPayload = withKnowledgeModeConfigurations(payload, next);
    onChange(typeof payload.modeDescription === "string" ? {
      ...nextPayload,
      modeDescription: syncModeDescription(
        payload.modeDescription,
        partitionKnowledgeModeConfigurations(next).primary.pmc,
        partitioned.primary.pmc,
        partitionKnowledgeModeConfigurations(next).primary.execution.in_house,
        partitioned.primary.execution.in_house
      )
    } : nextPayload);
  }

  function updateConfiguration(nextConfiguration: KnowledgeModeConfiguration) {
    const existingIndex = parsed.configurations.findIndex(
      ({ id }) => id === nextConfiguration.id
    );
    if (existingIndex < 0) {
      updateConfigurations([...parsed.configurations, nextConfiguration]);
      return;
    }
    updateConfigurations(parsed.configurations.map((configuration, index) =>
      index === existingIndex ? nextConfiguration : configuration
    ));
  }

  function removeRecoveryConfiguration(configurationId: string) {
    updateConfigurations(parsed.configurations.filter(({ id }) =>
      id !== configurationId
    ));
  }

  function moveRecoveryConfiguration(
    configurationId: string,
    executionSource: KnowledgeExecutionSource
  ) {
    updateConfigurations(parsed.configurations.map((configuration) =>
      configuration.id === configurationId
        ? {
            ...configuration,
            modeKind: "execution",
            executionSource,
            legacyModeId: null
          }
        : configuration
    ));
    showExecutionSource(executionSource);
  }

  function issueFor(path: string): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  const pmcMarginControl = <KnowledgePmcMarginRange key={descriptionResetKey}
    {...pmcMarginRange(payload)} readOnly={readOnly}
    errors={{ minimum: issueFor("pmcMinimumMarginBps"), maximum: issueFor("pmcMarginBps") }}
    onFieldRef={(field, node) => {
      const path = field === "minimum" ? "pmcMinimumMarginBps" : "pmcMarginBps";
      if (node) fieldRefs.current.set(path, node);
      else fieldRefs.current.delete(path);
    }}
    onChange={(field, value) => {
      onDirty();
      onChange(withPmcMargin(payload, field, value));
    }} />;

  function inHouseScopeItems(list: KnowledgePmcScopeList) {
    return inHouseConfiguration?.[list] ?? (inHouseConfiguration && Object.hasOwn(inHouseConfiguration, list)
      ? [] : inHouseScopeStarterItems(list));
  }

  function updateInHouseScope(list: KnowledgePmcScopeList, items: ReturnType<typeof inHouseScopeItems>) {
    const configuration = inHouseConfiguration ?? createKnowledgeModeConfiguration("execution", "in_house");
    updateConfiguration({
      ...configuration,
      inclusions: list === "inclusions" ? items : inHouseScopeItems("inclusions").map((item) => ({ ...item })),
      exclusions: list === "exclusions" ? items : inHouseScopeItems("exclusions").map((item) => ({ ...item }))
    });
  }

  const subVendorMarginControl = <KnowledgeSubVendorMarginRange key={descriptionResetKey}
    {...subVendorMarginRange(payload)} readOnly={readOnly}
    errors={{ minimum: issueFor("subVendorMinimumMarginBps"), maximum: issueFor("subVendorMarginBps") }}
    onFieldRef={(field, node) => {
      const path = field === "minimum" ? "subVendorMinimumMarginBps" : "subVendorMarginBps";
      if (node) fieldRefs.current.set(path, node);
      else fieldRefs.current.delete(path);
    }}
    onChange={(field, value) => {
      onDirty();
      onChange(withSubVendorMargin(payload, field, value));
    }} />;

  // Keep calculators mounted so changing visible modes preserves incomplete inputs.
  function calculationSlot(scope: ModeCalculationScope) {
    if (!calculation) return null;
    const executionSource = scope === "sub_vendor" ? "sub_vendor" : "in_house";
    const active = scope === "pmc" ? visibleModes.pmc : visibleModes.execution && visibleExecutionSources[executionSource];
    return <div className="knowledge-mode-calculation-slot" key={scope} hidden={!active}
      ref={(node) => {
        if (node) fieldRefs.current.set(`modeCalculations.${scope}`, node);
        else fieldRefs.current.delete(`modeCalculations.${scope}`);
      }}
    >{calculation(scope, active, scope === "pmc" ? pmcMarginControl : scope === "sub_vendor" ? subVendorMarginControl : undefined)}</div>;
  }

  function sectionHeader(mode: KnowledgeModeKind | KnowledgeExecutionSource) {
    const isExecutionSource = mode === "sub_vendor" || mode === "in_house";
    const label = mode === "pmc" ? "PMC" : mode === "execution" ? "Execution" : executionSourceLabel(mode);
    const Icon = mode === "pmc" ? ClipboardCheck : mode === "execution" ? HardHat : mode === "sub_vendor" ? Users : Wrench;
    const expanded = isExecutionSource ? expandedExecutionSources[mode] : expandedModes[mode];
    const Heading = isExecutionSource ? "h4" : "h3";
    const context = mode === "pmc" ? `PMC fee for ${mainLineName}`
      : mode === "execution" ? `Execution${selectedSourceLabel ? ` (${selectedSourceLabel})` : ""} for ${mainLineName}`
      : mode === "sub_vendor" ? `Vendor costs and margin for ${mainLineName}` : `Labor and material costs for ${mainLineName}`;
    const tag = mode === "pmc" ? "Management fee" : mode === "execution" ? "Work costs"
      : mode === "sub_vendor" ? "Vendor delivery" : "Own team";
    const action = expanded ? "Collapse" : "Expand";
    return <header className="knowledge-mode-configuration__section-header" data-expanded={expanded}>
      <Heading className="knowledge-mode-configuration__section-heading">
        <button type="button" className="knowledge-mode-configuration__section-toggle"
          aria-label={`${action} ${label}`} aria-expanded={expanded} aria-controls={`knowledge-mode-body-${mode}`}
          onClick={() => {
            if (isExecutionSource) setExpandedExecutionSources((current) => ({ ...current, [mode]: !current[mode] }));
            else setExpandedModes((current) => ({ ...current, [mode]: !current[mode] }));
          }}>
          <span className="knowledge-mode-configuration__section-icon"><Icon aria-hidden="true" /></span>
          <span className="knowledge-mode-configuration__section-labels">
            <span id={`knowledge-mode-${mode}-title`} className="knowledge-mode-configuration__section-title">{label}</span>
            <span id={`knowledge-mode-${mode}-context`} className="knowledge-mode-configuration__mode-context">
              {context}
            </span>
          </span>
          <span className="knowledge-mode-configuration__section-tag">{tag}</span>
          <span className="knowledge-mode-configuration__section-disclosure">
            <span className="knowledge-mode-configuration__section-toggle-label">{action}</span>
            <ChevronDown aria-hidden="true" />
          </span>
        </button>
      </Heading>
    </header>;
  }

  return (
    <div
      className="knowledge-section-editor knowledge-mode-configuration"
      role="group"
      aria-labelledby="knowledge-mode-configuration-title"
    >
      <h2 id="knowledge-mode-configuration-title" className="sr-only">Mode configuration</h2>
      {readOnly ? <span className="knowledge-readonly-label">Read-only revision</span> : null}

      {issues.length ? (
        <div
          ref={validationSummaryRef}
          className="knowledge-validation-summary"
          role="alert"
          tabIndex={-1}
        >
          <strong>Review {issues.length} Mode configuration issue{issues.length === 1 ? "" : "s"}</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${issue.message}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (issue.path === "pmcMarginBps" || issue.path === "pmcMinimumMarginBps") showMode("pmc");
                    if (issue.path === "modeDescription" && !visibleModes.pmc && !visibleModes.execution) showMode("pmc");
                    selectConfigurationForIssue(
                      issue,
                      parsed.configurations,
                      showMode,
                      showExecutionSource
                    );
                    globalThis.setTimeout(() => {
                      focusIssue(issue, fieldRefs.current, validationSummaryRef.current);
                    }, 0);
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="knowledge-mode-configuration__intro">
        <fieldset className="knowledge-mode-configuration__mode-selector">
          <legend>Mode</legend>
          <div className="knowledge-mode-configuration__mode-options">
            {KNOWLEDGE_MODE_OPTIONS.map((choice) => (
              <label key={choice.modeKind}
                className={`knowledge-mode-configuration__mode-choice knowledge-mode-configuration__mode-choice--${choice.modeKind}`}
                data-selected={visibleModes[choice.modeKind]}>
                <Checkbox
                  checked={visibleModes[choice.modeKind]}
                  aria-controls={`knowledge-mode-section-${choice.modeKind}`}
                  aria-describedby={visibleModes[choice.modeKind] ? `knowledge-mode-${choice.modeKind}-context` : undefined}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    if (checked) showMode(choice.modeKind);
                    else setVisibleModes((current) => ({ ...current, [choice.modeKind]: false }));
                  }}
                />
                <span className="knowledge-mode-configuration__choice-glyph" aria-hidden="true">
                  {choice.modeKind === "pmc" ? <ClipboardCheck /> : <HardHat />}
                </span>
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="knowledge-mode-configuration__shared" hidden={!visibleModes.pmc && !visibleModes.execution}
          ref={(node) => {
            if (node) fieldRefs.current.set("modeDescription", node);
            else fieldRefs.current.delete("modeDescription");
          }}
        >
          <h3 className="knowledge-mode-configuration__shared-title">Shared description</h3>
          <KnowledgeModeDescriptionEditor
            key={descriptionResetKey}
            description={description}
            pmc={partitioned.primary.pmc}
            inHouse={inHouseConfiguration}
            readOnly={readOnly}
            validationAttempt={validationAttempt}
            error={issueFor("modeDescription")}
            onPendingChange={handlePendingDescriptionChange}
            onPendingTextChange={onPendingDescriptionTextChange}
            onSave={(text) => {
              const modeDescription = text === generatedDescription ? null : text;
              if (modeDescription === (payload.modeDescription ?? null)) return;
              onDirty();
              onChange({ ...payload, modeDescription });
            }}
          />
        </div>
      </div>

      <div className="knowledge-mode-configuration__sections">
        <section id="knowledge-mode-section-pmc" aria-labelledby="knowledge-mode-pmc-title"
          className="knowledge-mode-configuration__section knowledge-mode-configuration__section--pmc" hidden={!visibleModes.pmc}>
          {visibleModes.pmc ? sectionHeader("pmc") : null}
          <div id="knowledge-mode-body-pmc" className="knowledge-mode-configuration__section-body" hidden={!expandedModes.pmc}>
            {!calculation ? pmcMarginControl : calculationSlot("pmc")}
          </div>
        </section>

        <section id="knowledge-mode-section-execution" hidden={!visibleModes.execution} aria-labelledby="knowledge-mode-execution-title"
          className="knowledge-mode-configuration__section knowledge-mode-configuration__section--execution">
          {visibleModes.execution ? sectionHeader("execution") : null}
          <div id="knowledge-mode-body-execution" className="knowledge-mode-configuration__section-body" hidden={!expandedModes.execution}>
            {visibleModes.execution ? <div className="knowledge-mode-configuration__mode-content">
              <fieldset className="knowledge-mode-configuration__execution-source">
                <legend>Execution source</legend>
                <p className="knowledge-mode-configuration__source-hint">Select one or both sources. Each keeps its own settings.</p>
                <div className="knowledge-mode-configuration__execution-source-options">
                  {KNOWLEDGE_EXECUTION_SOURCE_OPTIONS.map((option) => (
                    <label key={option.executionSource}
                      className={`knowledge-mode-configuration__source-choice knowledge-mode-configuration__source-choice--${option.executionSource}`}
                      data-selected={visibleExecutionSources[option.executionSource]}>
                      <Checkbox
                        checked={visibleExecutionSources[option.executionSource]}
                        aria-controls={`knowledge-mode-section-${option.executionSource}`}
                        onChange={(event) => {
                          if (event.target.checked) showExecutionSource(option.executionSource);
                          else setVisibleExecutionSources((current) => ({ ...current, [option.executionSource]: false }));
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div> : null}

            {KNOWLEDGE_EXECUTION_SOURCE_OPTIONS.map(({ executionSource: source }) => {
              const active = visibleModes.execution && visibleExecutionSources[source];
              return <section key={source} id={`knowledge-mode-section-${source}`}
                aria-labelledby={`knowledge-mode-${source}-title`} hidden={!active}
                className={`knowledge-mode-configuration__section knowledge-mode-configuration__section--source knowledge-mode-configuration__section--${source}`}>
                {active ? sectionHeader(source) : null}
                <div id={`knowledge-mode-body-${source}`} className="knowledge-mode-configuration__section-body" hidden={!expandedExecutionSources[source]}>
                  {source === "sub_vendor" ? <>
                    <section hidden={!showSubVendorScope} aria-label="Sub-Vendor scope">
                      {showSubVendorScope ? <div className="knowledge-mode-configuration__mode-content">
                        <div className="knowledge-pmc-scope">
                          {PMC_SCOPE_LISTS.map((list) => (
                            <KnowledgePmcScopeChecklist
                              key={list}
                              list={list}
                              items={partitioned.primary.pmc?.[list] ?? []}
                              oppositeItems={partitioned.primary.pmc?.[list === "inclusions" ? "exclusions" : "inclusions"] ?? []}
                              readOnly={readOnly}
                              onChange={(items) => {
                                const configuration = partitioned.primary.pmc ?? createKnowledgeModeConfiguration("pmc");
                                updateConfiguration({
                                  ...configuration,
                                  [list]: items
                                });
                              }}
                            />
                          ))}
                        </div>
                      </div> : null}
                    </section>
                    {!calculation ? subVendorMarginControl : calculationSlot("sub_vendor")}
                  </> : <>
                    <section aria-label="In-house scope">
                      <div className="knowledge-mode-configuration__mode-content">
                        <div className="knowledge-pmc-scope knowledge-in-house-scope">
                          {PMC_SCOPE_LISTS.map((list) => (
                            <KnowledgePmcScopeChecklist
                              key={list}
                              list={list}
                              contextLabel="In-house"
                              items={inHouseScopeItems(list)}
                              oppositeItems={inHouseScopeItems(list === "inclusions" ? "exclusions" : "inclusions")}
                              readOnly={readOnly}
                              onChange={(items) => updateInHouseScope(list, items)}
                            />
                          ))}
                        </div>
                      </div>
                    </section>
                    {calculationSlot("in_house_labor")}
                    {calculationSlot("in_house_material")}
                    {inHouseTotal?.(active)}
                  </>}
                </div>
              </section>;
            })}
          </div>
        </section>
      </div>

      {recoveries.length ? (
        <section
          className="knowledge-mode-configuration__recovery"
          aria-labelledby="knowledge-mode-recovery-title"
        >
          <div className="knowledge-section-heading">
            <div>
              <h3 id="knowledge-mode-recovery-title">Saved Mode configurations needing recovery</h3>
              <p>These historical definitions remain separate until explicitly moved or removed.</p>
            </div>
          </div>
          {partitioned.recovery.some(({ reason }) => reason === "unresolved") && (
            legacyModeCatalogState.status === "loading" || legacyModeCatalogState.refreshing
          ) ? <p role="status">Checking saved Mode configuration mapping…</p> : null}
          {partitioned.recovery.some(({ reason }) => reason === "unresolved") && (
            legacyModeCatalogState.status === "error" || legacyModeCatalogState.errorMessage
          ) ? (
            <InlineMessage
              tone="warning"
              role="status"
              title="Saved Mode configuration mapping is unavailable"
              action={legacyModeCatalogState.onRetry ? (
                <Button size="compact" variant="quiet" onClick={legacyModeCatalogState.onRetry}>Try again</Button>
              ) : undefined}
            >
              {legacyModeCatalogState.errorMessage ?? "Existing saved configurations could not be matched to PMC or Execution."}
            </InlineMessage>
          ) : null}
          {recoveries.map((recovery, recoveryIndex) => {
            const canMoveExecution = recovery.reason === "unscoped_execution" &&
              recovery.modeKind === "execution" &&
              recovery.executionSource === null;
            const actions = !readOnly ? (
              <div className="knowledge-mode-configuration__recovery-actions">
                {canMoveExecution && !partitioned.primary.execution.sub_vendor ? (
                  <Button
                    size="compact"
                    variant="secondary"
                    onClick={() => moveRecoveryConfiguration(
                      recovery.configuration.id,
                      "sub_vendor"
                    )}
                  >
                    Move to Sub-Vendor
                  </Button>
                ) : null}
                {canMoveExecution && !partitioned.primary.execution.in_house ? (
                  <Button
                    size="compact"
                    variant="secondary"
                    onClick={() => moveRecoveryConfiguration(
                      recovery.configuration.id,
                      "in_house"
                    )}
                  >
                    Move to In-house
                  </Button>
                ) : null}
                <Button
                  size="compact"
                  variant="destructive-outline"
                  aria-label={`Remove saved Mode recovery ${recoveryIndex + 1}`}
                  onClick={() => removeRecoveryConfiguration(recovery.configuration.id)}
                >
                  Remove configuration
                </Button>
              </div>
            ) : undefined;
            return (
              <InlineMessage
                key={recovery.configuration.id}
                tone="warning"
                role="status"
                title={recoveryTitle(recovery.reason, recoveryIndex)}
                action={actions}
              >
                <p>{recoveryMessage(recovery.reason)}</p>
                <RecoveryModeFields
                  fields={recovery.configuration.fields}
                  index={recoveryIndex}
                />
              </InlineMessage>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

function ignorePendingDescription() {}

export function modeSelectionForPayload(
  payload: KnowledgeJsonObject,
  configurations = parseKnowledgeModeConfigurations(payload.modeConfigurations).configurations
): {
  readonly modes: Record<KnowledgeModeKind, boolean>;
  readonly executionSources: Record<KnowledgeExecutionSource, boolean>;
} {
  const primary = partitionKnowledgeModeConfigurations(configurations).primary;
  const rawCalculations = payload.modeCalculations;
  const calculations = rawCalculations && typeof rawCalculations === "object" && !Array.isArray(rawCalculations)
    ? rawCalculations as KnowledgeJsonObject
    : undefined;
  const completeCalculation = (value: KnowledgeJsonObject[string] | undefined) =>
    value != null && modeCalculationIssues(value).length === 0;
  const pmcRange = pmcMarginRange(payload);
  const completePmcMargin = pmcRange.minimum != null && pmcRange.maximum != null &&
    pmcMarginRangeIssues(payload).length === 0;
  const subVendorRange = subVendorMarginRange(payload);
  const completeSubVendorMargin = subVendorRange.minimum != null && subVendorRange.maximum != null &&
    subVendorMarginRangeIssues(payload).length === 0;
  const hasSplitInHouse = calculations != null &&
    (Object.hasOwn(calculations, "in_house_labor") || Object.hasOwn(calculations, "in_house_material"));
  // The established Sub-Vendor scope is stored on the canonical PMC row.
  // An own list, including an explicitly saved empty list, is therefore
  // source-specific evidence that Sub-Vendor was configured or reviewed.
  const hasSubVendorScope = primary.pmc != null && PMC_SCOPE_LISTS.some((list) =>
    primary.pmc?.[list] !== undefined);
  const pmc = Boolean(primary.pmc || completeCalculation(calculations?.pmc) || completePmcMargin);
  const subVendor = Boolean(primary.execution.sub_vendor || hasSubVendorScope || completeCalculation(calculations?.sub_vendor) ||
    completeSubVendorMargin);
  const inHouse = Boolean(primary.execution.in_house ||
    (hasSplitInHouse
      ? completeCalculation(calculations?.in_house_labor) || completeCalculation(calculations?.in_house_material)
      : completeCalculation(calculations?.in_house)));
  const hasUnmatchedModeData = payload.modeCalculation != null ||
    (calculations != null && Object.values(calculations).some((value) => value != null)) ||
    (Array.isArray(payload.modeConfigurations) && payload.modeConfigurations.length > 0) ||
    [payload.pmcMinimumMarginBps, payload.pmcMarginBps,
      payload.subVendorMinimumMarginBps, payload.subVendorMarginBps]
      .some((value) => value != null);
  const empty = !pmc && !subVendor && !inHouse && !hasUnmatchedModeData;
  return {
    modes: { pmc: pmc || empty, execution: subVendor || inHouse },
    executionSources: { sub_vendor: subVendor || empty, in_house: inHouse }
  };
}

function RecoveryModeFields({
  fields,
  index
}: {
  readonly fields: readonly KnowledgeModeConfigurationField[];
  readonly index: number;
}) {
  if (!fields.length) return <p>No saved components.</p>;
  return (
    <dl aria-label={`Saved Mode recovery ${index + 1} components`}>
      {fields.map((field, fieldIndex) => (
        <div key={field.id}>
          <dt>{field.label.trim() || `Unnamed saved component ${fieldIndex + 1}`}</dt>
          <dd>
            {knowledgeModeFieldTypeLabel(field.type)}
            {isChoiceField(field.type) && field.options.length
              ? ` · ${field.options.join(", ")}`
              : ""}
            {knowledgeModeFieldValueLabel(field)
              ? ` · Value: ${knowledgeModeFieldValueLabel(field)}`
              : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function recoveryTitle(
  reason: ReturnType<typeof partitionKnowledgeModeConfigurations>["recovery"][number]["reason"] | "invalid_fields",
  index: number
): string {
  if (reason === "invalid_fields") return "Saved Execution components need recovery";
  if (reason === "unscoped_execution") return "Saved Execution configuration needs a source";
  if (reason === "legacy_reference") return "Saved legacy Mode configuration needs recovery";
  if (reason === "collision") return "Saved Mode configuration conflicts with another configuration";
  if (reason === "invalid_source") return "Saved Mode configuration has an invalid source";
  return `Saved Mode configuration ${index + 1} needs recovery`;
}

function recoveryMessage(
  reason: ReturnType<typeof partitionKnowledgeModeConfigurations>["recovery"][number]["reason"] | "invalid_fields"
): string {
  if (reason === "invalid_fields") {
    return "These saved components no longer pass validation. Remove this component configuration from the Draft to continue. Calculation and margin settings are retained.";
  }
  if (reason === "unscoped_execution") {
    return "This historical configuration was not assigned automatically. Move it to an empty Execution source or remove it from this Draft.";
  }
  if (reason === "legacy_reference") {
    return "This historical configuration was not assigned automatically. Remove it from this Draft if it is no longer required.";
  }
  if (reason === "collision") {
    return "Another configuration already owns this Mode or Execution source. The definitions were not merged.";
  }
  if (reason === "invalid_source") {
    return "This historical configuration cannot be assigned safely to the current hierarchy.";
  }
  return "This saved configuration cannot be matched safely to PMC or Execution.";
}

function executionSourceLabel(source: KnowledgeExecutionSource): "Sub-Vendor" | "In-house" {
  return KNOWLEDGE_EXECUTION_SOURCE_OPTIONS.find(
    ({ executionSource }) => executionSource === source
  )!.label;
}

function selectConfigurationForIssue(
  issue: KnowledgeModeConfigurationIssue,
  configurations: readonly KnowledgeModeConfiguration[],
  selectMode: (mode: KnowledgeModeKind) => void,
  selectExecutionSource: (source: KnowledgeExecutionSource) => void
) {
  if (issue.path === "subVendorMarginBps" || issue.path === "subVendorMinimumMarginBps") {
    selectMode("execution");
    selectExecutionSource("sub_vendor");
    return;
  }
  const scope = calculationScopeForIssue(issue.path);
  if (scope) {
    selectMode(scope === "pmc" ? "pmc" : "execution");
    if (scope !== "pmc") selectExecutionSource(scope === "sub_vendor" ? "sub_vendor" : "in_house");
    return;
  }
  const match = /^modeConfigurations\.(\d+)/u.exec(issue.path);
  const configuration = match ? configurations[Number(match[1])] : undefined;
  if (configuration?.modeKind === "pmc" && /^modeConfigurations\.\d+\.(inclusions|exclusions)(?:\.|$)/u.test(issue.path)) {
    selectMode("execution");
    selectExecutionSource("sub_vendor");
    return;
  }
  if (configuration?.modeKind === "pmc") selectMode("pmc");
  if (
    configuration?.modeKind === "execution" &&
    configuration.executionSource !== null
  ) {
    selectMode("execution");
    selectExecutionSource(configuration.executionSource);
  }
}

function focusIssue(
  issue: KnowledgeModeConfigurationIssue,
  refs: ReadonlyMap<string, HTMLElement>,
  fallback: HTMLDivElement | null
) {
  const issuePath = issue.path === "modeCalculation" || issue.path.startsWith("modeCalculation.")
    ? issue.path.replace("modeCalculation", "modeCalculations.pmc")
    : issue.path === "modeCalculations.in_house" || issue.path.startsWith("modeCalculations.in_house.")
      ? issue.path.replace("modeCalculations.in_house", "modeCalculations.in_house_labor") : issue.path;
  const entry = [...refs.entries()].find(([path]) => issuePath.startsWith(path));
  const issueControl = issue.path.endsWith(".label")
    ? "[id$='-label']"
    : issue.path.endsWith(".type")
      ? "[id$='-type']"
      : issue.path.endsWith(".value")
        ? "[id$='-value']"
        : issue.path.includes(".options")
          ? "[id$='-options']"
          : undefined;
  const invalidCalculationControl = issue.path.startsWith("modeCalculation")
    ? entry?.[1].querySelector<HTMLElement>("[aria-invalid='true']")
    : null;
  const target = invalidCalculationControl ?? entry?.[1].querySelector<HTMLElement>(issueControl ??
    "[aria-invalid='true'], input, select, textarea, button"
  );
  (target ?? fallback)?.focus();
}
