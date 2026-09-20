import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeQualityParameterFields } from "./KnowledgeQualityParameterFields";
import { KnowledgeQualityControlOptionDialog } from "./KnowledgeQualityControlOptionDialog";
import { createQualityParameter, qualityParameterNeedsCompletion, qualitySamplingForFrequency, QUALITY_MAX_PARAMETERS, validateQualityParametersForSave, type QualityControlOptionCatalog, type QualityFrequency } from "./knowledgeQuality";
import { QUALITY_STAGE_OPTIONS, QUALITY_TYPE_LABELS, QUALITY_METHOD_LABELS, qualityEvidenceSummary, qualityFrequencyPresentation, qualityParameterKey, qualityPassRange, qualityPerformerPresentation, qualitySeverityPresentation, qualityStage, qualityStageCounts, qualityText, type QualityStageFilter } from "./knowledgeQualityPresentation";
import type { KnowledgeJsonObject, KnowledgeQualityControlOptionKind, KnowledgeQualityControlOptionReference } from "./knowledgeTypes";
import "./knowledge-quality-workspace.css";

export interface KnowledgeQualityChecklistEditorHandle { addParameter(): void; close(): void }
interface Props {
  readonly parameters: readonly KnowledgeJsonObject[];
  readonly savedParameters: readonly KnowledgeJsonObject[];
  readonly basketName: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly validationAttempt: number;
  readonly qualityOptions?: QualityControlOptionCatalog;
  readonly qualityOptionsLoading?: Readonly<Partial<Record<KnowledgeQualityControlOptionKind, boolean>>>;
  readonly canCreateQualityOptions?: boolean;
  readonly onAnnouncement?: (message: string) => void;
  readonly onChange: (parameters: readonly KnowledgeJsonObject[]) => void;
}

/** Filtering and panels are views of the outer draft; no detached parameter draft exists. */
export const KnowledgeQualityChecklistEditor = forwardRef<KnowledgeQualityChecklistEditorHandle, Props>(function KnowledgeQualityChecklistEditor({ parameters, savedParameters, basketName, disabled, readOnly, validationAttempt, qualityOptions, qualityOptionsLoading, canCreateQualityOptions = false, onAnnouncement, onChange }, ref) {
  const [filter, setFilter] = useState<QualityStageFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [focusRequest, setFocusRequest] = useState(0);
  const [quickAddKind, setQuickAddKind] = useState<KnowledgeQualityControlOptionKind | null>(null);
  const quickAddReturnFocusRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLHeadingElement | null>(null);
  const panelFieldsRef = useRef<HTMLDivElement | null>(null);
  const counts = useMemo(() => qualityStageCounts(parameters), [parameters]);
  const issues = useMemo(() => validateQualityParametersForSave(parameters, qualityOptions), [parameters, qualityOptions]);
  const selectedIndex = parameters.findIndex((row, index) => qualityParameterKey(row, index) === selectedKey);
  const selected = parameters[selectedIndex];
  const selectedIssues = issues.filter(issue => issue.path.startsWith(`parameters.${selectedIndex}.`));
  const rowPrefix = `quality-parameter-${selectedIndex}`;
  const seenAttempt = useRef(validationAttempt);

  useEffect(() => {
    if (validationAttempt === seenAttempt.current) return;
    seenAttempt.current = validationAttempt;
    const match = /^parameters\.(\d+)(?:\.|$)/u.exec(issues[0]?.path ?? "");
    const index = match ? Number(match[1]) : -1;
    if (parameters[index]) {
      setFilter("all");
      setSelectedKey(qualityParameterKey(parameters[index], index));
      setFocusRequest(value => value + 1);
    } else fallbackFocusRef.current?.focus();
  }, [validationAttempt, issues, parameters]);

  useEffect(() => {
    if (!focusRequest || !selected) return;
    const field = selectedIssues[0]?.path.replace(`parameters.${selectedIndex}.`, "");
    const suffix = field === "allowedValues" || field?.startsWith("allowedValues.") ? "values"
      : field === "sampling" || field?.startsWith("sampling.") ? "frequency"
      : field === "evidence.minPhotosPerSample" ? "photo-count"
        : field === "evidence.instructions" ? "evidence-instructions" : field;
    const target = document.getElementById(`${rowPrefix}-${suffix}`) ?? panelFieldsRef.current?.querySelector<HTMLElement>("[data-quality-errors]");
    // The overlay also focuses after opening; give both paths the same validation target.
    initialFocusRef.current = target ?? null;
    target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
    // Only a save attempt requests focus; typing should never steal it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useImperativeHandle(ref, () => ({
    addParameter() {
      if (disabled || readOnly || parameters.length >= QUALITY_MAX_PARAMETERS) return;
      initialFocusRef.current = null;
      const parameter = createQualityParameter();
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onChange([...parameters, parameter]);
      setFilter("all");
      setSelectedKey(qualityParameterKey(parameter, parameters.length));
    },
    close() { setSelectedKey(null); }
  }));

  function update(key: string, next: KnowledgeJsonObject) {
    if (disabled || readOnly) return;
    onChange(parameters.map((row, index) => qualityParameterKey(row, index) === key ? next : row));
  }
  function remove(key: string) {
    if (disabled || readOnly) return;
    onChange(parameters.filter((row, index) => qualityParameterKey(row, index) !== key));
    if (key === selectedKey) setSelectedKey(null);
    fallbackFocusRef.current?.focus();
  }
  function move(key: string, direction: -1 | 1) {
    if (disabled || readOnly || filter !== "all") return;
    const from = parameters.findIndex((row, index) => qualityParameterKey(row, index) === key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= parameters.length) return;
    const next = [...parameters];
    [next[from], next[to]] = [next[to]!, next[from]!];
    onChange(next);
  }
  const filters = [{ key: "all", label: "All Stages" }, ...QUALITY_STAGE_OPTIONS,
    ...(counts.other || filter === "other" ? [{ key: "other", label: "Other stages" }] : []),
    ...(counts.unassigned || filter === "unassigned" ? [{ key: "unassigned", label: "Unassigned" }] : [])] as const;
  const visibleRows = parameters.map((value, index) => ({ value, index, key: qualityParameterKey(value, index) }))
    .filter(({ value }) => filter === "all" || qualityStage(value.stage).key === filter);
  const savedByKey = new Map(savedParameters.map((row, index) => [qualityParameterKey(row, index), { value: row, index }]));
  return <div className="knowledge-quality-workspace">
    <div className="knowledge-quality-stage-filters" role="group" aria-label="Filter quality parameters by stage">
      {filters.map(option => <Button key={option.key} size="compact" variant="quiet" aria-pressed={filter === option.key} aria-label={`${option.label}, ${counts[option.key as QualityStageFilter]} parameters`} onClick={() => setFilter(option.key as QualityStageFilter)}>{option.label}<span className="knowledge-quality-stage-count">{counts[option.key as QualityStageFilter]}</span></Button>)}
    </div>
    <h3 className="knowledge-quality-workspace__count" tabIndex={-1} ref={fallbackFocusRef}>{visibleRows.length} of {parameters.length} parameters<span> · Current checklist{parameters !== savedParameters ? " draft" : ""}</span></h3>
    {validationAttempt > 0 && issues.length && !selected ? <InlineMessage tone="error" role="alert"><strong>Review the checklist before saving.</strong><ul>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></InlineMessage> : null}
    {filter !== "all" && !readOnly ? <p className="knowledge-help-text">Choose All Stages to reorder parameters in the full checklist.</p> : null}
    {parameters.length >= QUALITY_MAX_PARAMETERS ? <p className="knowledge-help-text">The checklist contains the maximum of {QUALITY_MAX_PARAMETERS} parameters.</p> : null}
    <div className="knowledge-quality-table-region" role="region" aria-label="Quality parameters table" tabIndex={0}>
      <table className="knowledge-quality-table">
        <caption className="sr-only">Quality parameters shared with all items in {basketName}</caption>
        <thead><tr><th scope="col">#</th><th scope="col">Parameter</th><th scope="col">Stage</th><th scope="col">Type</th><th scope="col">Controls</th><th scope="col">Acceptance criteria</th><th scope="col">Evidence required</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>{visibleRows.map(({ value, index, key }) => {
          const stage = qualityStage(value.stage);
          const savedRow = savedByKey.get(key);
          const isUnsaved = !savedRow || savedRow.index !== index || JSON.stringify(savedRow.value) !== JSON.stringify(value);
          const needsCompletion = qualityParameterNeedsCompletion(value, qualityOptions);
          const invalid = validationAttempt > 0 && issues.some(issue => issue.path.startsWith(`parameters.${index}.`));
          const evidence = value.evidence && typeof value.evidence === "object" && !Array.isArray(value.evidence) ? value.evidence as KnowledgeJsonObject : {};
          const rowName = qualityText(value.label) || "New quality check";
          return <tr key={key} data-expanded={expanded.has(key)} data-invalid={invalid || undefined}>
            <td className="knowledge-quality-table__number" data-label="Number">{index + 1}</td>
            <th scope="row" className="knowledge-quality-table__question"><strong>{rowName}</strong>{qualityText(value.instructions) ? <span>{qualityText(value.instructions)}</span> : null}<Button className="knowledge-quality-table__mobile-details" variant="quiet" size="compact" aria-expanded={expanded.has(key)} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>{expanded.has(key) ? "Hide details" : "Show details"}<ChevronDown aria-hidden="true" /></Button></th>
            <td className="knowledge-quality-table__stage" data-label="Stage"><span className={`knowledge-quality-stage knowledge-quality-stage--${stage.key}`}>{stage.label}</span></td>
            <td className="knowledge-quality-table__detail" data-label="Type"><span>{QUALITY_TYPE_LABELS[qualityText(value.type)] ?? (qualityText(value.type) || "Not selected")}</span>{qualityText(value.checkMethod) ? <small>{QUALITY_METHOD_LABELS[qualityText(value.checkMethod)] ?? qualityText(value.checkMethod)}</small> : null}</td>
            <td className="knowledge-quality-table__detail knowledge-quality-table__controls" data-label="Controls"><QualityControlsSummary parameter={value} qualityOptions={qualityOptions} /></td>
            <td className="knowledge-quality-table__detail" data-label="Acceptance criteria">{qualityText(value.acceptanceCriteria) || <span className="knowledge-quality-table__muted">Not specified</span>}</td>
            <td className="knowledge-quality-table__detail" data-label="Evidence required">{qualityEvidenceSummary(value, qualityOptions)}{qualityText(evidence.instructions) ? <small>{qualityText(evidence.instructions)}</small> : null}</td>
            <td className="knowledge-quality-table__status" data-label="Status"><span className={`knowledge-quality-status knowledge-quality-status--${needsCompletion ? "invalid" : isUnsaved ? "draft" : "active"}`}>{needsCompletion ? "Needs completion" : isUnsaved ? "Unsaved" : "Active"}</span></td>
            <td className="knowledge-quality-table__actions"><div>
              <Button size="compact" variant="quiet" aria-label={`${readOnly || disabled ? "View" : "Edit"} parameter ${index + 1}: ${rowName}`} onClick={(event) => { initialFocusRef.current = null; returnFocusRef.current = event.currentTarget; setSelectedKey(key); }} leadingIcon={<Pencil aria-hidden="true" />}><span className="sr-only">{readOnly || disabled ? "View" : "Edit"}</span></Button>
              {!readOnly ? <details className="knowledge-quality-row-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                <summary aria-label={`More actions for parameter ${index + 1}`}><Ellipsis aria-hidden="true" /></summary>
                <div className="knowledge-quality-row-menu__items">
                  <RowAction label={`Move Quality parameters entry ${index + 1} up`} disabled={disabled || filter !== "all" || index === 0} icon={<ArrowUp />} onClick={() => move(key, -1)}>Move up</RowAction>
                  <RowAction label={`Move Quality parameters entry ${index + 1} down`} disabled={disabled || filter !== "all" || index === parameters.length - 1} icon={<ArrowDown />} onClick={() => move(key, 1)}>Move down</RowAction>
                  <RowAction label={`Remove Quality parameters entry ${index + 1}`} disabled={disabled} icon={<Trash2 />} onClick={() => remove(key)}>Remove parameter</RowAction>
                </div>
              </details> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
      {!visibleRows.length ? <div className="knowledge-quality-workspace__empty"><strong>{parameters.length ? "No parameters for this stage" : "No quality parameters yet"}</strong><p>{parameters.length ? "Choose another stage to view the rest of this checklist." : readOnly ? "No shared checks have been configured for this Main Basket." : "Add a parameter or import an Excel checklist to define the checks for this Main Basket."}</p></div> : null}
    </div>
    {selected ? <ContextPanel title={readOnly ? "Quality parameter details" : "Edit quality parameter"} eyebrow={`Parameter ${selectedIndex + 1} · ${basketName}`} description={readOnly ? "This shared checklist is read-only." : "Changes stay in your checklist draft. Use Save shared checklist after reviewing your parameters."} onClose={() => setSelectedKey(null)} initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef} width="wide" className="knowledge-quality-parameter-panel" footer={<div className="knowledge-quality-parameter-panel__footer"><span>{readOnly ? "Shared across this Main Basket" : "Closing keeps your draft changes"}</span><Button onClick={() => setSelectedKey(null)}>Done</Button></div>}>
      <div ref={panelFieldsRef}>
        {validationAttempt > 0 && selectedIssues.length ? <div tabIndex={-1} data-quality-errors><InlineMessage tone="error" role="alert"><strong>Review this parameter before saving.</strong><ul>{selectedIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></InlineMessage></div> : null}
        <KnowledgeQualityParameterFields errors={validationAttempt > 0 ? Object.fromEntries(selectedIssues.map(issue => [issue.path.replace(`parameters.${selectedIndex}.`, ""), issue.message])) : undefined} key={selectedKey} prefix={rowPrefix} value={selected} disabled={disabled || readOnly} detailed qualityOptions={qualityOptions} qualityOptionsLoading={qualityOptionsLoading} canCreateQualityOptions={canCreateQualityOptions} onQuickAddQualityOption={(kind, target) => { quickAddReturnFocusRef.current = target; setQuickAddKind(kind); }} onChange={next => update(selectedKey!, next)} />
      </div>
    </ContextPanel> : null}
    {quickAddKind && selected && selectedKey ? <KnowledgeQualityControlOptionDialog kind={quickAddKind} returnFocusRef={quickAddReturnFocusRef} onClose={() => setQuickAddKind(null)} onSaved={(value, name, created) => {
      const next = quickAddKind === "frequency"
        ? { ...selected, sampling: qualitySamplingForFrequency(value as QualityFrequency | KnowledgeQualityControlOptionReference)! }
        : { ...selected, responsibleRole: value };
      update(selectedKey, next);
      onAnnouncement?.(`${name} ${created ? "added and " : ""}selected. Save the shared checklist to apply this draft change.`);
    }} /> : null}
  </div>;
});

function RowAction({ label, disabled, icon, onClick, children }: { readonly label: string; readonly disabled: boolean; readonly icon: ReactNode; readonly onClick: () => void; readonly children: ReactNode }) {
  return <Button size="compact" variant="quiet" aria-label={label} disabled={disabled} leadingIcon={icon} onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; onClick(); }}>{children}</Button>;
}

function QualityControlsSummary({ parameter, qualityOptions }: { readonly parameter: KnowledgeJsonObject; readonly qualityOptions?: QualityControlOptionCatalog }) {
  const severity = qualitySeverityPresentation(parameter.severity);
  const performer = qualityPerformerPresentation(parameter.responsibleRole, qualityOptions);
  const frequency = qualityFrequencyPresentation(parameter.sampling, qualityOptions);
  const range = qualityPassRange(parameter);
  return <dl className="knowledge-quality-control-summary">
    <div><dt>Severity</dt><dd><span className={`knowledge-quality-severity knowledge-quality-severity--${qualityText(parameter.severity) || "missing"}`}>{severity.label}</span>{severity.meaning ? <small>{severity.meaning}</small> : null}</dd></div>
    <div><dt>Performed by</dt><dd>{performer.label}</dd></div>
    <div><dt>Frequency</dt><dd>{frequency.label}</dd></div>
    {range ? <div><dt>Pass range</dt><dd>{range}</dd></div> : null}
  </dl>;
}
