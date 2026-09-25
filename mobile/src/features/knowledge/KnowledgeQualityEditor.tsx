import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createQualityParameter, mandatoryQualityParameters, qualityImportIssues, validateQualityParametersForSave, QUALITY_MAX_PARAMETERS, type QualityControlOptionCatalog } from "../../../../shared/knowledge/knowledgeQuality";
import { qualityFrequencyPresentation, qualityPerformerPresentation, qualitySeverityPresentation } from "../../../../shared/knowledge/knowledgeQualityPresentation";
import type { QualityImportResult } from "../../../../shared/knowledge/knowledgeQualityWorkbook";
import type { KnowledgeBasketQuality, KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeQualityControlOptionKind } from "../../../../shared/knowledge/knowledgeTypes";
import { budgetAlterationRows } from "../../../../shared/knowledge/knowledgeBudgetAlterations";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, IconButton, KnowledgeDisclosure, KnowledgeSelect } from "./knowledgeDetailUi";
import type { KnowledgeQualityEditorProps, KnowledgeSaveHandle } from "./knowledgeEditorContracts";
import { KnowledgeCard, KnowledgeModal, KnowledgeText, knowledgeStyles as s } from "./knowledgeDetailUi";
import { KnowledgeQualityParameterEditor } from "./KnowledgeQualityParameterEditor";
import { selectQualityWorkbook, shareQualityWorkbook } from "./KnowledgeQualityWorkbook";
import { knowledgeText as text } from "./knowledgeNativeRules";

interface QualityDraft { readonly version: number; readonly baseline: readonly KnowledgeJsonObject[]; readonly parameters: readonly KnowledgeJsonObject[] }

export const KnowledgeQualityEditor = forwardRef<KnowledgeSaveHandle, KnowledgeQualityEditorProps>(function KnowledgeQualityEditor(props, ref) {
  return <BasketQualityEditor key={JSON.stringify([props.context.scopeKey, props.item.mainLineId, props.item.basketId, props.revisionId])} {...props} ref={ref} />;
});

const BasketQualityEditor = forwardRef<KnowledgeSaveHandle, KnowledgeQualityEditorProps>(function BasketQualityEditor({ item, revisionId, embedded = false, context, onDirtyChange, onBusyChange }, ref) {
  const client = useQueryClient();
  const queryKey = context.key("basket-quality", item.basketId);
  const query = useQuery({ queryKey, queryFn: () => context.api.getKnowledgeBasketQuality(item.basketId), enabled: context.ready });
  const frequency = useQuery({ queryKey: context.key("quality-options", "frequency"), queryFn: () => context.api.listKnowledgeQualityControlOptions("frequency"), enabled: context.ready });
  const performer = useQuery({ queryKey: context.key("quality-options", "performer"), queryFn: () => context.api.listKnowledgeQualityControlOptions("performer"), enabled: context.ready });
  const options = useMemo<QualityControlOptionCatalog>(() => ({ frequency: frequency.data?.items ?? [], performer: performer.data?.items ?? [] }), [frequency.data, performer.data]);
  const optionsReady = !!frequency.data && !!performer.data;
  const [draft, setDraft] = useState<QualityDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [optionBusy, setOptionBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [conflict, setConflict] = useState(false);
  const [conflictReview, setConflictReview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validation, setValidation] = useState(false);
  const [importReview, setImportReview] = useState<QualityImportResult | null>(null);
  const [stage, setStage] = useState("");
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [optionKind, setOptionKind] = useState<KnowledgeQualityControlOptionKind | null>(null);
  const [optionName, setOptionName] = useState("");
  const operation = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = saving || fileBusy || optionBusy;
  const editable = context.canUpdate && item.status !== "archived" && !!query.data && query.data.basketStatus !== "archived";
  const parameters = draft?.parameters ?? query.data?.parameters ?? [];
  const currentRow = parameters.find(row => row.id === editingId);
  const issues = validateQualityParametersForSave(parameters, options);
  const disabled = !editable || busy || conflict;
  const legacy = useQuery({ queryKey: context.key("legacy-quality", item.mainLineId, revisionId), queryFn: () => context.api.getKnowledgeSection<KnowledgeJsonObject>(item.mainLineId, revisionId!, "quality"), enabled: context.ready && legacyOpen && !!revisionId });
  useEffect(() => onDirtyChange(!!draft), [draft, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); }, [onDirtyChange, onBusyChange]);

  function change(next: readonly KnowledgeJsonObject[]) {
    if (disabled || !query.data) return;
    setDraft({ version: draft?.version ?? query.data.version, baseline: draft?.baseline ?? query.data.parameters, parameters: mandatoryQualityParameters(next) });
    setError(""); setAnnouncement("");
  }
  function discard() {
    if (operation.current || busy) return;
    setDraft(null); setError(""); setConflict(false); setConflictReview(false); setValidation(false); setEditingId(null); setImportReview(null); setOptionKind(null);
  }
  async function save(): Promise<boolean> {
    if (!draft) return true;
    if (!editable || busy || operation.current || conflict) return false;
    if (!optionsReady) { setError("Load reusable Quality values before saving."); return false; }
    if (issues.length) { setValidation(true); setError("Complete the required checklist fields before saving."); return false; }
    operation.current = true; setSaving(true); setError("");
    try {
      const saved = await context.api.updateKnowledgeBasketQuality(item.basketId, { expectedVersion: draft.version, parameters: draft.parameters });
      if (!alive.current) return false;
      client.setQueryData(queryKey, saved);
      setDraft(null); setConflict(false); setValidation(false); setAnnouncement(`Shared checklist saved for all items in ${saved.basketName}.`);
      await Promise.allSettled([context.refresh(), client.invalidateQueries({ queryKey: context.key() })]);
      return true;
    } catch (failure) {
      if (!alive.current) return false;
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setConflict(true); setError("The shared Main Basket checklist changed. Your draft is retained. Review the latest saved checklist before rebasing or discard your edits.");
        await query.refetch();
      } else setError(failure instanceof Error ? failure.message : "The checklist could not be saved.");
      return false;
    } finally { operation.current = false; if (alive.current) setSaving(false); }
  }
  useImperativeHandle(ref, () => ({ save, discard }));

  async function fileAction(kind: "import" | "template" | "saved") {
    if (busy || operation.current || !optionsReady || !query.data || kind === "import" && disabled) return;
    operation.current = true; setFileBusy(true); setError("");
    try {
      if (kind === "import") { const result = await selectQualityWorkbook(options); if (alive.current && result) setImportReview(result); }
      else await shareQualityWorkbook(kind, query.data.basketName, query.data.parameters, options);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "The workbook action failed."); }
    finally { operation.current = false; if (alive.current) setFileBusy(false); }
  }
  async function createOption() {
    if (!optionKind || !optionName.trim() || !context.canCreateQualityOptions || disabled || operation.current || !currentRow) return;
    operation.current = true; setOptionBusy(true); setError("");
    try {
      const saved = await context.api.createKnowledgeQualityControlOption({ kind: optionKind, name: optionName.trim() });
      if (!alive.current) return;
      client.setQueryData(context.key("quality-options", optionKind), { items: [...options[optionKind].filter(option => option.id !== saved.id), saved] });
      const next = parameters.map(row => row.id !== currentRow.id ? row : optionKind === "frequency" ? { ...row, sampling: { method: "all", unit: saved.id } } : { ...row, responsibleRole: saved.id });
      setDraft({ version: draft?.version ?? query.data!.version, baseline: draft?.baseline ?? query.data!.parameters, parameters: mandatoryQualityParameters(next) });
      setOptionKind(null); setOptionName("");
      await Promise.allSettled([context.refresh(), client.invalidateQueries({ queryKey: context.key("quality-options") })]);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "The reusable value could not be created."); }
    finally { operation.current = false; if (alive.current) setOptionBusy(false); }
  }

  if (!query.data) return <KnowledgeCard title="Quality Parameters"><KnowledgeText error={query.isError}>{query.isPending ? "Loading the shared Main Basket checklist…" : "The shared checklist could not be loaded."}</KnowledgeText>{query.isError ? <Button label="Retry checklist" variant="secondary" onPress={() => { void query.refetch(); }} /> : null}</KnowledgeCard>;
  const saved = query.data;
  const incomingIssues = importReview ? qualityImportIssues(parameters, importReview.parameters) : [];
  return <View style={s.stack}>
    <KnowledgeCard title={`Quality Parameters (${parameters.length})`} actions={editable ? <IconButton label="Add Parameter" icon="add" disabled={disabled || parameters.length >= QUALITY_MAX_PARAMETERS} onPress={() => { const row = createQualityParameter(); change([...parameters, row]); setEditingId(text(row.id)); }} /> : null}><KnowledgeText>Shared with all items in {saved.basketName}. {saved.revisionId ? `Checklist version ${saved.revisionNumber}` : "No shared checklist saved"}.</KnowledgeText>{!editable ? <KnowledgeText>Read only. Shared checklist changes require Configuration update access and an unarchived item and Main Basket.</KnowledgeText> : null}
      <KnowledgeDisclosure title="Excel import & export"><View style={s.row}><Button label="Excel template" variant="secondary" disabled={busy || !optionsReady} onPress={() => { void fileAction("template"); }} />{saved.revisionId && saved.parameters.length ? <Button label="Export saved Excel" variant="secondary" disabled={busy || !optionsReady} onPress={() => { void fileAction("saved"); }} /> : null}{editable ? <Button label="Import Excel" variant="secondary" disabled={disabled || !optionsReady} onPress={() => { void fileAction("import"); }} /> : null}</View></KnowledgeDisclosure>
      {draft && saved.parameters.length ? <KnowledgeText>Excel export uses the saved checklist. Save to include your edits.</KnowledgeText> : null}
      {editable && !embedded ? <View style={s.row}><Button label="Save shared checklist" disabled={!draft || disabled} loading={saving} onPress={() => { void save(); }} />{draft ? <Button label="Discard checklist edits" variant="quiet" disabled={busy} onPress={discard} /> : null}</View> : null}
      {fileBusy ? <KnowledgeText>Preparing workbook…</KnowledgeText> : null}
    </KnowledgeCard>
    {query.isError ? <KnowledgeCard><KnowledgeText error>The latest shared checklist could not be refreshed. Cached content and your draft are preserved.</KnowledgeText><Button label="Retry checklist refresh" variant="secondary" onPress={() => { void query.refetch(); }} /></KnowledgeCard> : null}
    {!optionsReady || frequency.isError || performer.isError ? <KnowledgeCard><KnowledgeText error={frequency.isError || performer.isError}>{optionsReady ? "Reusable values could not be refreshed. Cached values remain available." : "Load reusable Quality values before saving or using Excel."}</KnowledgeText><Button label="Retry Quality values" variant="secondary" onPress={() => { void Promise.all([frequency.refetch(), performer.refetch()]); }} /></KnowledgeCard> : null}
    {error ? <KnowledgeText error>{error}</KnowledgeText> : null}{announcement ? <KnowledgeText>{announcement}</KnowledgeText> : null}
    {conflict ? <KnowledgeCard title="Checklist version conflict"><KnowledgeText>Your draft has {draft?.parameters.length ?? 0} checks; the latest saved checklist has {saved.parameters.length}. Review both before continuing.</KnowledgeText><Button label="Review latest saved checklist" variant="secondary" disabled={query.isFetching || query.isError} onPress={() => setConflictReview(true)} /></KnowledgeCard> : null}
    {validation && issues.length ? <KnowledgeCard title="Checklist needs attention">{issues.map((issue, index) => <KnowledgeText key={`${issue.path}-${index}`} error>{issue.path}: {issue.message}</KnowledgeText>)}</KnowledgeCard> : null}
    {parameters.length ? <KnowledgeSelect label="Filter by stage" value={stage} placeholder="All stages" options={[...new Set(parameters.map(row => text(row.stage)).filter(Boolean))].map(value => ({ value, label: value }))} onChange={setStage} /> : null}
    {!parameters.length ? <KnowledgeText>No quality parameters yet.</KnowledgeText> : parameters.map((row, index) => ({ row, index })).filter(({ row }) => !stage || text(row.stage) === stage).map(({ row, index }) => <KnowledgeCard key={`${text(row.id)}-${index}`} title={text(row.label) || `Check ${index + 1}`} actions={<IconButton label={`${editable ? "Edit" : "View"} check ${index + 1}`} icon={editable ? "edit" : "right"} disabled={busy} onPress={() => setEditingId(text(row.id))} />}><KnowledgeText>{text(row.stage) || "No stage"}</KnowledgeText><QualityRowSummary row={row} options={options} /></KnowledgeCard>)}
    {stage && !parameters.some(row => text(row.stage) === stage) ? <KnowledgeText>No checks match this stage.</KnowledgeText> : null}
    {revisionId ? <KnowledgeCard title="Previous quality parameters" actions={<IconButton label={legacyOpen ? "Hide previous parameters" : "Show previous parameters"} icon={legacyOpen ? "down" : "right"} onPress={() => setLegacyOpen(open => !open)} />}>{legacyOpen ? <><KnowledgeText>Saved item history is read only. The basket checklist takes precedence for future AI analysis.</KnowledgeText>{legacy.isPending ? <KnowledgeText>Loading previous parameters…</KnowledgeText> : legacy.isError ? <><KnowledgeText error>Previous parameters could not be loaded.</KnowledgeText><Button label="Retry previous parameters" variant="secondary" onPress={() => { void legacy.refetch(); }} /></> : budgetAlterationRows(legacy.data?.payload.parameters).length ? budgetAlterationRows(legacy.data?.payload.parameters).map((row, index) => <View key={`${text(row.id)}-${index}`} style={s.card}><KnowledgeText>{text(row.label) || `Check ${index + 1}`}</KnowledgeText><QualityRowSummary row={row} options={options} /><QualityDetails row={row} /></View>) : <KnowledgeText>No previous item-specific quality parameters.</KnowledgeText>}</> : null}</KnowledgeCard> : null}
    {currentRow ? <KnowledgeModal title="Quality check" busy={busy} onClose={() => { setEditingId(null); setOptionKind(null); }}><KnowledgeQualityParameterEditor value={currentRow} disabled={disabled} options={options} onChange={next => change(parameters.map(row => row.id === currentRow.id ? next : row))} {...(editable && context.canCreateQualityOptions ? { onCreateOption: (kind: KnowledgeQualityControlOptionKind) => { setOptionKind(kind); setOptionName(""); } } : {})} />
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
      {optionKind ? <KnowledgeCard title={`Add ${optionKind === "frequency" ? "frequency" : "performed by"}`}><Field label="Reusable value name" value={optionName} onChangeText={setOptionName} editable={!busy} maxLength={240} /><Button label="Create reusable value" disabled={busy || !optionName.trim()} loading={optionBusy} onPress={() => { void createOption(); }} /><Button label="Cancel reusable value" variant="quiet" disabled={busy} onPress={() => setOptionKind(null)} /></KnowledgeCard> : null}
      {!disabled && parameters.length > 1 ? <View style={s.row}>{([-1, 1] as const).map(direction => <Button key={direction} label={`Move check ${direction < 0 ? "up" : "down"}`} variant="secondary" disabled={parameters.indexOf(currentRow) + direction < 0 || parameters.indexOf(currentRow) + direction >= parameters.length} onPress={() => { const index = parameters.indexOf(currentRow); const next = [...parameters]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; change(next); }} />)}</View> : null}
      {!disabled ? <Button label="Remove this check" variant="danger" onPress={() => { change(parameters.filter(row => row.id !== currentRow.id)); setEditingId(null); }} /> : null}
      <Button label="Done editing check" variant="secondary" disabled={busy} onPress={() => { setEditingId(null); setOptionKind(null); }} />
    </KnowledgeModal> : null}
    {importReview ? <KnowledgeModal title="Review Excel import" busy={busy} onClose={() => setImportReview(null)}><KnowledgeText>{importReview.parameters.length} checks will append to your unsaved draft. Nothing is saved automatically.</KnowledgeText>{importReview.issues.map((issue, index) => <KnowledgeText key={index} error>{issue.row ? `Row ${issue.row}: ` : ""}{issue.column ? `${issue.column}: ` : ""}{issue.message}</KnowledgeText>)}{incomingIssues.map((issue, index) => <KnowledgeText key={`incoming-${index}`} error>{issue.message}</KnowledgeText>)}{importReview.parameters.map((row, index) => <KnowledgeCard key={index} title={text(row.label)}><QualityRowSummary row={row} options={options} /></KnowledgeCard>)}<Button label="Append checks to draft" disabled={disabled || !importReview.parameters.length || !!importReview.issues.length || !!incomingIssues.length} onPress={() => { if (qualityImportIssues(parameters, importReview.parameters).length) return; change([...parameters, ...importReview.parameters]); setImportReview(null); }} /></KnowledgeModal> : null}
    {conflictReview && draft ? <KnowledgeModal title="Review checklist conflict" busy={busy} onClose={() => setConflictReview(false)}><KnowledgeText>Rebasing keeps your full draft and uses the latest saved version for a later explicit save. Saving then replaces the latest checklist with your reviewed draft.</KnowledgeText><ChecklistSnapshot title="Latest saved checklist" value={saved} /><KnowledgeCard title="Your retained draft">{draft.parameters.map((row, index) => <View key={index} style={s.card}><KnowledgeText>{index + 1}. {text(row.label) || "Unnamed check"}</KnowledgeText><QualityDetails row={row} /></View>)}</KnowledgeCard><Button label="Use latest version with my reviewed draft" disabled={!editable || query.isError || query.isFetching || busy || saved.version === draft.version} onPress={() => { setDraft({ ...draft, version: saved.version, baseline: saved.parameters }); setConflict(false); setConflictReview(false); setError(""); setAnnouncement("Draft rebased. Review and save the shared checklist when ready."); }} /><Button label="Discard my draft and use saved checklist" variant="danger" disabled={busy} onPress={discard} /></KnowledgeModal> : null}
  </View>;
});

function QualityRowSummary({ row, options }: { readonly row: KnowledgeJsonObject; readonly options: QualityControlOptionCatalog }) {
  return <><KnowledgeText>{text(row.type).replaceAll("_", " ")} · {qualitySeverityPresentation(row.severity).label}</KnowledgeText><KnowledgeText>{qualityFrequencyPresentation(row.sampling, options).label} · {qualityPerformerPresentation(row.responsibleRole, options).label}</KnowledgeText>{row.acceptanceCriteria ? <KnowledgeText>{text(row.acceptanceCriteria)}</KnowledgeText> : null}</>;
}
function ChecklistSnapshot({ title, value }: { readonly title: string; readonly value: KnowledgeBasketQuality }) {
  return <KnowledgeCard title={title}><KnowledgeText>Version {value.version}; {value.parameters.length} checks.</KnowledgeText>{value.parameters.map((row, index) => <View key={index} style={s.card}><KnowledgeText>{index + 1}. {text(row.label) || "Unnamed check"}</KnowledgeText><QualityDetails row={row} /></View>)}</KnowledgeCard>;
}

const QUALITY_FIELD_LABELS: Readonly<Record<string, string>> = {
  type: "Answer type", allowedValues: "Options", minimum: "Minimum", maximum: "Maximum", unit: "Unit",
  defaultValue: "Default answer", required: "Required", active: "Active", category: "Category", stage: "Stage",
  instructions: "Instructions", acceptanceCriteria: "Acceptance criteria", checkMethod: "Check method",
  severity: "Severity", responsibleRole: "Performed by", failureAction: "Failure action", sampling: "Sampling",
  evidence: "Evidence", method: "Method", value: "Value", photos: "Photos", documents: "Documents", video: "Video",
  minPhotosPerSample: "Minimum photos per sample"
};
function qualityReviewValue(value: KnowledgeJsonValue): string {
  if (value === null) return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(qualityReviewValue).join(", ") || "None";
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${QUALITY_FIELD_LABELS[key] ?? key}: ${qualityReviewValue(entry)}`).join("; ") || "Not set";
  return String(value);
}
function QualityDetails({ row }: { readonly row: KnowledgeJsonObject }) {
  return <View style={s.stack}>{Object.entries(row).filter(([key]) => !["id", "label"].includes(key)).map(([key, value]) => <KnowledgeText key={key}>{QUALITY_FIELD_LABELS[key] ?? key}: {qualityReviewValue(value)}</KnowledgeText>)}</View>;
}
