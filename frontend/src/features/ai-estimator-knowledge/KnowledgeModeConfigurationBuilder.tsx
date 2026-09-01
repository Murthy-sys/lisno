import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Input, Radio, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  KNOWLEDGE_EXECUTION_SOURCE_OPTIONS,
  KNOWLEDGE_MODE_FIELD_TYPES,
  KNOWLEDGE_MODE_OPTIONS,
  createKnowledgeModeConfiguration,
  createKnowledgeModeField,
  isChoiceField,
  knowledgeModeFieldTypeLabel,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations,
  withKnowledgeModeConfigurations,
  type KnowledgeExecutionSource,
  type KnowledgeModeConfiguration,
  type KnowledgeModeConfigurationField,
  type KnowledgeModeConfigurationIssue,
  type KnowledgeModeFieldType,
  type KnowledgeModeKind
} from "./knowledgeModeConfiguration";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import type {
  KnowledgeJsonObject,
  KnowledgeMaster
} from "./knowledgeTypes";

export interface KnowledgeModeConfigurationBuilderProps {
  readonly payload: KnowledgeJsonObject;
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
    () => [...parsed.issues, ...serverIssues],
    [parsed.issues, serverIssues]
  );
  const [selectedMode, setSelectedMode] = useState<KnowledgeModeKind>("pmc");
  const [selectedExecutionSource, setSelectedExecutionSource] =
    useState<KnowledgeExecutionSource>("sub_vendor");
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef(new Map<string, HTMLDivElement>());
  const lastValidationAttempt = useRef(0);
  const selectedConfiguration = selectedMode === "pmc"
    ? partitioned.primary.pmc
    : partitioned.primary.execution[selectedExecutionSource];
  const selectedSourceLabel = selectedMode === "pmc"
    ? "PMC"
    : executionSourceLabel(selectedExecutionSource);
  const repeaterLabel = `${selectedSourceLabel} components`;

  useEffect(() => {
    onValidationChange(issues.length === 0);
  }, [issues.length, onValidationChange]);
  useEffect(() => {
    if (validationAttempt === 0) {
      lastValidationAttempt.current = 0;
      return;
    }
    if (validationAttempt <= lastValidationAttempt.current || !issues.length) return;
    lastValidationAttempt.current = validationAttempt;
    const firstIssue = issues[0]!;
    selectConfigurationForIssue(
      firstIssue,
      parsed.configurations,
      setSelectedMode,
      setSelectedExecutionSource
    );
    globalThis.setTimeout(() => {
      focusIssue(firstIssue, fieldRefs.current, validationSummaryRef.current);
    }, 0);
  }, [issues, parsed.configurations, validationAttempt]);

  function updateConfigurations(next: readonly KnowledgeModeConfiguration[]) {
    onDirty();
    onChange(withKnowledgeModeConfigurations(payload, next));
  }

  function ensureSelectedConfiguration(): KnowledgeModeConfiguration {
    return selectedConfiguration ?? createKnowledgeModeConfiguration(
      selectedMode,
      selectedMode === "execution" ? selectedExecutionSource : null
    );
  }

  function updateSelectedConfiguration(nextConfiguration: KnowledgeModeConfiguration) {
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
    const configuration = ensureSelectedConfiguration();
    if (configuration.fields.length >= 50) return;
    updateSelectedConfiguration({
      ...configuration,
      fields: [...configuration.fields, createKnowledgeModeField()]
    });
  }

  function replaceField(fieldId: string, next: KnowledgeModeConfigurationField) {
    if (!selectedConfiguration) return;
    updateSelectedConfiguration({
      ...selectedConfiguration,
      fields: selectedConfiguration.fields.map((field) =>
        field.id === fieldId ? next : field
      )
    });
  }

  function removeField(fieldId: string) {
    if (!selectedConfiguration) return;
    updateSelectedConfiguration({
      ...selectedConfiguration,
      fields: selectedConfiguration.fields.filter(({ id }) => id !== fieldId)
    });
  }

  function moveField(fieldId: string, direction: "up" | "down") {
    if (!selectedConfiguration) return;
    const fields = [...selectedConfiguration.fields];
    const from = fields.findIndex(({ id }) => id === fieldId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= fields.length) return;
    [fields[from], fields[to]] = [fields[to]!, fields[from]!];
    updateSelectedConfiguration({ ...selectedConfiguration, fields });
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
    setSelectedMode("execution");
    setSelectedExecutionSource(executionSource);
  }

  function issueFor(path: string): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  const configurationIndex = parsed.configurations.findIndex(
    ({ id }) => id === selectedConfiguration?.id
  );

  return (
    <div
      className="knowledge-section-editor knowledge-mode-configuration"
      aria-labelledby="knowledge-mode-configuration-title"
    >
      <div className="knowledge-section-heading">
        <div>
          <h2 id="knowledge-mode-configuration-title">Mode configuration</h2>
          <p>Define the required inputs for each Mode. Entered answers are not stored here.</p>
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
                    selectConfigurationForIssue(
                      issue,
                      parsed.configurations,
                      setSelectedMode,
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

      <Field id="knowledge-mode-configuration-selector" label="Mode" required>
        {(props) => (
          <Select
            {...props}
            value={selectedMode}
            onChange={(event) => setSelectedMode(event.target.value as KnowledgeModeKind)}
          >
            {KNOWLEDGE_MODE_OPTIONS.map((choice) => (
              <option key={choice.modeKind} value={choice.modeKind}>{choice.label}</option>
            ))}
          </Select>
        )}
      </Field>

      {selectedMode === "execution" ? (
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
      ) : null}

      <KnowledgeRepeater
        label={repeaterLabel}
        addLabel="Add component"
        items={selectedConfiguration?.fields ?? []}
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
                        replaceField(field.id, {
                          ...field,
                          type,
                          options: isChoiceField(type) ? field.options : []
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
                        onChange={(event) => replaceField(field.id, {
                          ...field,
                          options: event.target.value === ""
                            ? []
                            : event.target.value.split("\n")
                        })}
                      />
                    )}
                  </Field>
                ) : null}
              </div>
            </div>
          );
        }}
      />

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
      : issue.path.includes(".options")
        ? "[id$='-options']"
        : undefined;
  const target = entry?.[1].querySelector<HTMLElement>(issueControl ??
    "[aria-invalid='true'], input, select, textarea, button"
  );
  (target ?? fallback)?.focus();
}

function domId(id: string): string {
  return `knowledge-mode-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}
