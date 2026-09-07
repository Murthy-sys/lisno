import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  KNOWLEDGE_EXECUTION_SOURCE_OPTIONS,
  KNOWLEDGE_MODE_FIELD_TYPES,
  KNOWLEDGE_MODE_OPTIONS,
  coerceKnowledgeModeFieldValue,
  createKnowledgeModeConfiguration,
  createKnowledgeModeField,
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
  type KnowledgeModeFieldType,
  type KnowledgeModeFieldValue,
  type KnowledgeModeKind
} from "./knowledgeModeConfiguration";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import { KnowledgePmcScopeChecklist } from "./KnowledgePmcScopeChecklist";
import { KnowledgeModeDescriptionEditor } from "./KnowledgeModeDescriptionEditor";
import { generateModeDescription, modeDescriptionIssues } from "./knowledgeModeDescription";
import { modeCalculationIssues } from "./knowledgeModeCalculation";
import { defaultPmcScopeItems, PMC_SCOPE_LISTS } from "./knowledgePmcScope";
import type {
  KnowledgeJsonObject,
  KnowledgeMaster
} from "./knowledgeTypes";

export interface KnowledgeModeConfigurationBuilderProps {
  readonly payload: KnowledgeJsonObject;
  readonly mainLineName: string;
  readonly calculation?: ReactNode;
  readonly calculationValid?: boolean;
  readonly descriptionResetKey?: string;
  readonly onPendingDescriptionChange?: (pending: boolean) => void;
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
  calculationValid = true,
  descriptionResetKey = "default",
  onPendingDescriptionChange = ignorePendingDescription,
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
  const issues = useMemo(
    () => [...parsed.issues, ...modeDescriptionIssues(payload.modeDescription), ...modeCalculationIssues(payload.modeCalculation), ...serverIssues],
    [parsed.issues, payload.modeDescription, payload.modeCalculation, serverIssues]
  );
  const [paragraphPending, setParagraphPending] = useState(false);
  const handlePendingDescriptionChange = useCallback((pending: boolean) => {
    setParagraphPending(pending);
    onPendingDescriptionChange(pending);
  }, [onPendingDescriptionChange]);
  const generatedDescription = generateModeDescription(mainLineName, partitioned.primary.pmc);
  const description = typeof payload.modeDescription === "string" ? payload.modeDescription : generatedDescription;
  const [visibleModes, setVisibleModes] = useState<Record<KnowledgeModeKind, boolean>>({
    pmc: true,
    execution: false
  });
  const showMode = useCallback((mode: KnowledgeModeKind) => {
    setVisibleModes((current) => ({ ...current, [mode]: true }));
  }, []);
  const [selectedExecutionSource, setSelectedExecutionSource] =
    useState<KnowledgeExecutionSource>("sub_vendor");
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef(new Map<string, HTMLDivElement>());
  const lastValidationAttempt = useRef(0);
  const executionConfiguration = partitioned.primary.execution[selectedExecutionSource];
  const selectedSourceLabel = executionSourceLabel(selectedExecutionSource);
  const repeaterLabel = `${selectedSourceLabel} components`;

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
    if ((paragraphPending || !calculationValid || issues[0]?.path === "modeDescription" || issues[0]?.path.startsWith("modeCalculation")) && !visibleModes.pmc && !visibleModes.execution) showMode("pmc");
    const firstIssue = paragraphPending ? { path: "modeDescription", message: "Save or cancel the paragraph." }
      : !calculationValid ? { path: "modeCalculation", message: "Review the calculation inputs." } : issues[0]!;
    selectConfigurationForIssue(
      firstIssue,
      parsed.configurations,
      showMode,
      setSelectedExecutionSource
    );
    globalThis.setTimeout(() => {
      focusIssue(firstIssue, fieldRefs.current, validationSummaryRef.current);
    }, 0);
  }, [issues, paragraphPending, calculationValid, parsed.configurations, showMode, validationAttempt, visibleModes]);

  function updateConfigurations(next: readonly KnowledgeModeConfiguration[]) {
    onDirty();
    onChange(withKnowledgeModeConfigurations(payload, next));
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

  function addComponent() {
    const configuration = executionConfiguration ?? createKnowledgeModeConfiguration(
      "execution", selectedExecutionSource
    );
    if (configuration.fields.length >= 50) return;
    updateConfiguration({
      ...configuration,
      fields: [...configuration.fields, createKnowledgeModeField()]
    });
  }

  function replaceField(fieldId: string, next: KnowledgeModeConfigurationField) {
    if (!executionConfiguration) return;
    updateConfiguration({
      ...executionConfiguration,
      fields: executionConfiguration.fields.map((field) =>
        field.id === fieldId ? next : field
      )
    });
  }

  function removeField(fieldId: string) {
    if (!executionConfiguration) return;
    updateConfiguration({
      ...executionConfiguration,
      fields: executionConfiguration.fields.filter(({ id }) => id !== fieldId)
    });
  }

  function moveField(fieldId: string, direction: "up" | "down") {
    if (!executionConfiguration) return;
    const fields = [...executionConfiguration.fields];
    const from = fields.findIndex(({ id }) => id === fieldId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= fields.length) return;
    [fields[from], fields[to]] = [fields[to]!, fields[from]!];
    updateConfiguration({ ...executionConfiguration, fields });
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
    showMode("execution");
    setSelectedExecutionSource(executionSource);
  }

  function issueFor(path: string): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  const configurationIndex = parsed.configurations.findIndex(
    ({ id }) => id === executionConfiguration?.id
  );

  return (
    <div
      className="knowledge-section-editor knowledge-mode-configuration"
      aria-labelledby="knowledge-mode-configuration-title"
    >
      <div className="knowledge-section-heading">
        <div>
          <h2 id="knowledge-mode-configuration-title">Mode configuration</h2>
          <p>Define the required inputs for each Mode and the value the estimator should use.</p>
        </div>
        {readOnly ? <span className="knowledge-readonly-label">Read-only revision</span> : null}
      </div>

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
                    if ((issue.path === "modeDescription" || issue.path.startsWith("modeCalculation")) && !visibleModes.pmc && !visibleModes.execution) showMode("pmc");
                    selectConfigurationForIssue(
                      issue,
                      parsed.configurations,
                      showMode,
                      setSelectedExecutionSource
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

      <fieldset className="knowledge-mode-configuration__mode-selector">
        <legend>Mode</legend>
        <div className="knowledge-mode-configuration__mode-options">
          {KNOWLEDGE_MODE_OPTIONS.map((choice) => (
            <label key={choice.modeKind}>
              <Checkbox
                checked={visibleModes[choice.modeKind]}
                aria-controls={`knowledge-mode-section-${choice.modeKind}`}
                aria-describedby={visibleModes[choice.modeKind] ? `knowledge-mode-${choice.modeKind}-context` : undefined}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setVisibleModes((current) => ({ ...current, [choice.modeKind]: checked }));
                }}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        {visibleModes.pmc ? (
          <p id="knowledge-mode-pmc-context" className="knowledge-mode-configuration__mode-context">
            PMC for {mainLineName}
          </p>
        ) : null}
        {visibleModes.execution ? (
          <p id="knowledge-mode-execution-context" className="knowledge-mode-configuration__mode-context">
            Execution ({selectedSourceLabel}) for {mainLineName}
          </p>
        ) : null}
      </fieldset>

      <div hidden={!visibleModes.pmc && !visibleModes.execution}
        ref={(node) => {
          if (node) fieldRefs.current.set("modeDescription", node);
          else fieldRefs.current.delete("modeDescription");
        }}
      >
        <KnowledgeModeDescriptionEditor
          key={descriptionResetKey}
          description={description}
          readOnly={readOnly}
          validationAttempt={validationAttempt}
          error={issueFor("modeDescription")}
          onPendingChange={handlePendingDescriptionChange}
          onSave={(text) => {
            const modeDescription = text === generatedDescription ? null : text;
            if (modeDescription === (payload.modeDescription ?? null)) return;
            onDirty();
            onChange({ ...payload, modeDescription });
          }}
        />
      </div>

      <section id="knowledge-mode-section-pmc" hidden={!visibleModes.pmc} aria-labelledby="knowledge-mode-pmc-title">
        {visibleModes.pmc ? <div className="knowledge-mode-configuration__mode-content">
          <h3 id="knowledge-mode-pmc-title">PMC</h3>
          <div className="knowledge-pmc-scope">
            {PMC_SCOPE_LISTS.map((list) => (
              <KnowledgePmcScopeChecklist
                key={list}
                list={list}
                items={partitioned.primary.pmc?.[list] ?? defaultPmcScopeItems(list)}
                readOnly={readOnly}
                onChange={(items) => {
                  const configuration = partitioned.primary.pmc ?? createKnowledgeModeConfiguration("pmc");
                  updateConfiguration({
                    ...configuration,
                    inclusions: configuration.inclusions ?? defaultPmcScopeItems("inclusions"),
                    exclusions: configuration.exclusions ?? defaultPmcScopeItems("exclusions"),
                    [list]: items
                  });
                }}
              />
            ))}
          </div>
        </div> : null}
      </section>

      {calculation ? <div className="knowledge-mode-calculation-slot" hidden={!visibleModes.pmc && !visibleModes.execution}
        ref={(node) => {
          if (node) fieldRefs.current.set("modeCalculation", node);
          else fieldRefs.current.delete("modeCalculation");
        }}
      >{calculation}</div> : null}

      <section id="knowledge-mode-section-execution" hidden={!visibleModes.execution} aria-labelledby="knowledge-mode-execution-title">
        {visibleModes.execution ? <div className="knowledge-mode-configuration__mode-content">
          <h3 id="knowledge-mode-execution-title">Execution</h3>
          <fieldset className="knowledge-mode-configuration__execution-source">
            <legend>Execution source</legend>
            <div className="knowledge-mode-configuration__execution-source-options">
              {KNOWLEDGE_EXECUTION_SOURCE_OPTIONS.map((option) => (
                <label key={option.executionSource}>
                  <Radio
                    name="knowledge-mode-execution-source"
                    value={option.executionSource}
                    required
                    checked={selectedExecutionSource === option.executionSource}
                    onChange={() => setSelectedExecutionSource(option.executionSource)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <KnowledgeRepeater
            label={repeaterLabel}
            addLabel="Add component"
            items={executionConfiguration?.fields ?? []}
            readOnly={readOnly}
            emptyMessage={`No components configured for ${selectedSourceLabel}.`}
            itemLabel={(field, index) => field.label.trim() || `component ${index + 1}`}
            onAdd={addComponent}
            onRemove={removeField}
            onMove={moveField}
            renderItem={(field, index) => {
              const fieldPath = `modeConfigurations.${configurationIndex}.fields.${index}`;
              return (
                <div
                  ref={(node) => {
                    if (node) fieldRefs.current.set(fieldPath, node);
                    else fieldRefs.current.delete(fieldPath);
                  }}
                  className="knowledge-mode-field"
                >
                  <div className="knowledge-mode-field__definition">
                    <Field
                      id={`${domId(field.id)}-type`}
                      label="Component type"
                      required
                      error={issueFor(`${fieldPath}.type`)}
                    >
                      {(props) => (
                        <Select
                          {...props}
                          disabled={readOnly}
                          value={field.type}
                          onChange={(event) => {
                            const type = event.target.value as KnowledgeModeFieldType;
                            const options = isChoiceField(type) ? field.options : [];
                            replaceField(field.id, {
                              ...field,
                              type,
                              options,
                              value: coerceKnowledgeModeFieldValue(field.value, type, options)
                            });
                          }}
                        >
                          {KNOWLEDGE_MODE_FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>{knowledgeModeFieldTypeLabel(type)}</option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field
                      id={`${domId(field.id)}-label`}
                      label="Component label"
                      required
                      error={issueFor(`${fieldPath}.label`)}
                    >
                      {(props) => (
                        <Input
                          {...props}
                          maxLength={240}
                          disabled={readOnly}
                          value={field.label}
                          onChange={(event) => replaceField(field.id, {
                            ...field,
                            label: event.target.value
                          })}
                        />
                      )}
                    </Field>
                    {isChoiceField(field.type) ? (
                      <Field
                        id={`${domId(field.id)}-options`}
                        label="Allowed options"
                        hint="Enter one option per line."
                        required
                        error={issueForPrefix(`${fieldPath}.options`, issues)}
                      >
                        {(props) => (
                          <Textarea
                            {...props}
                            disabled={readOnly}
                            value={field.options.join("\n")}
                            onChange={(event) => {
                              const options = event.target.value === ""
                                ? []
                                : event.target.value.split("\n");
                              replaceField(field.id, {
                                ...field,
                                options,
                                value: coerceKnowledgeModeFieldValue(
                                  field.value,
                                  field.type,
                                  options
                                )
                              });
                            }}
                          />
                        )}
                      </Field>
                    ) : null}
                    <ModeFieldValueControl
                      field={field}
                      id={`${domId(field.id)}-value`}
                      readOnly={readOnly}
                      error={issueFor(`${fieldPath}.value`)}
                      onChange={(value) => replaceField(field.id, { ...field, value })}
                    />
                  </div>
                </div>
              );
            }}
          />
        </div> : null}
      </section>

      {partitioned.recovery.length ? (
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
          {partitioned.recovery.map((recovery, recoveryIndex) => {
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

/**
 * Renders the configured answer using the control the component type describes,
 * so a dropdown component is answered from its own allowed options rather than
 * free text that would later fail validation.
 */
function ModeFieldValueControl({
  field,
  id,
  readOnly,
  error,
  onChange
}: {
  readonly field: KnowledgeModeConfigurationField;
  readonly id: string;
  readonly readOnly: boolean;
  readonly error?: string;
  readonly onChange: (value: KnowledgeModeFieldValue) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <Field id={id} label="Value" hint="Leave cleared if this is not decided yet." error={error}>
        {(props) => (
          <Checkbox
            {...props}
            disabled={readOnly}
            checked={field.value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
        )}
      </Field>
    );
  }

  const text = typeof field.value === "string" ? field.value : "";

  if (isChoiceField(field.type)) {
    return (
      <Field
        id={id}
        label="Value"
        hint={field.options.length ? undefined : "Add allowed options first."}
        error={error}
      >
        {(props) => (
          <Select
            {...props}
            disabled={readOnly || field.options.length === 0}
            value={text}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">Not set</option>
            {field.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        )}
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field id={id} label="Value" error={error}>
        {(props) => (
          <Textarea
            {...props}
            maxLength={4000}
            disabled={readOnly}
            value={text}
            onChange={(event) => onChange(event.target.value || null)}
          />
        )}
      </Field>
    );
  }

  return (
    <Field id={id} label="Value" error={error}>
      {(props) => (
        <Input
          {...props}
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          maxLength={field.type === "number" ? undefined : 4000}
          disabled={readOnly}
          value={text}
          onChange={(event) => onChange(event.target.value || null)}
        />
      )}
    </Field>
  );
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
  reason: ReturnType<typeof partitionKnowledgeModeConfigurations>["recovery"][number]["reason"],
  index: number
): string {
  if (reason === "unscoped_execution") return "Saved Execution configuration needs a source";
  if (reason === "legacy_reference") return "Saved legacy Mode configuration needs recovery";
  if (reason === "collision") return "Saved Mode configuration conflicts with another configuration";
  if (reason === "invalid_source") return "Saved Mode configuration has an invalid source";
  return `Saved Mode configuration ${index + 1} needs recovery`;
}

function recoveryMessage(
  reason: ReturnType<typeof partitionKnowledgeModeConfigurations>["recovery"][number]["reason"]
): string {
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

function issueForPrefix(
  path: string,
  issues: readonly KnowledgeModeConfigurationIssue[]
): string | undefined {
  return issues.find((issue) =>
    issue.path === path || issue.path.startsWith(`${path}.`)
  )?.message;
}

function selectConfigurationForIssue(
  issue: KnowledgeModeConfigurationIssue,
  configurations: readonly KnowledgeModeConfiguration[],
  selectMode: (mode: KnowledgeModeKind) => void,
  selectExecutionSource: (source: KnowledgeExecutionSource) => void
) {
  const match = /^modeConfigurations\.(\d+)/u.exec(issue.path);
  const configuration = match ? configurations[Number(match[1])] : undefined;
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
  refs: ReadonlyMap<string, HTMLDivElement>,
  fallback: HTMLDivElement | null
) {
  const entry = [...refs.entries()].find(([path]) => issue.path.startsWith(path));
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

function domId(id: string): string {
  return `knowledge-mode-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}
