import { useEffect, useState, type ReactNode, type ComponentProps } from "react";
import { Text, View } from "react-native";
import { Button, Field, IconButton } from "./knowledgeDetailUi";
import { knowledgeRowId } from "../../../../shared/knowledge/knowledgeId";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "../../../../shared/knowledge/knowledgeTypes";
import { parseKnowledgeModeConfigurations, partitionKnowledgeModeConfigurations, type KnowledgeModeConfiguration } from "../../../../shared/knowledge/knowledgeModeConfiguration";
import { generateModeDescription, modeDescriptionIssues, syncModeDescription } from "../../../../shared/knowledge/knowledgeModeDescription";
import { modeSelectionForPayload } from "../../../../shared/knowledge/knowledgeModeSelection";
import { MODE_CALCULATION_SCOPES, MODE_CALCULATION_LABELS, modeCalculationsForPayload, modeCalculationsIssues, parseModeCalculationDraft, parseModeQuantity, type ModeCalculationScope } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues, withPmcMargin, withSubVendorMargin } from "../../../../shared/knowledge/knowledgePmcMargin";
import { formatPaiseForRupeeInput } from "../../../../shared/knowledge/knowledgePresentation";
import { inHouseScopeStarterItems, MAX_PMC_SCOPE_ITEMS, normalizePmcScopeName, PMC_SCOPE_LISTS, type KnowledgePmcScopeList } from "../../../../shared/knowledge/knowledgePmcScope";
import { parseKnowledgeSpecifications, validateKnowledgeBrands } from "../../../../shared/knowledge/knowledgeSpecificationConfiguration";
import type { KnowledgeModeEditorProps } from "./knowledgeEditorContracts";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles } from "./knowledgeDetailUi";
import { isKnowledgeObject, knowledgeText, nativeCalculationChange, nativeCalculationDraft, nativePercentage } from "./knowledgeModeNativeModel";
import { KnowledgeModeSimulator, type SimulatorScope } from "./KnowledgeModeSimulator";
import { KnowledgeSpecificationsEditor } from "./KnowledgeSpecificationsEditor";

export function KnowledgeModeEditor({ item, payload, onChange, pricingPayload, onPricingChange, overviewPayload, context, masters, catalogsReady, readOnly, onValidityChange, referencedSpecificationIds = [] }: KnowledgeModeEditorProps) {
  const parsed = parseKnowledgeModeConfigurations(payload.modeConfigurations, masters.modes ?? []);
  const partition = partitionKnowledgeModeConfigurations(parsed.configurations);
  const values = modeCalculationsForPayload(payload);
  const [visible, setVisible] = useState(() => {
    const selected = modeSelectionForPayload(payload, parsed.configurations);
    return { ...selected.modes, ...selected.executionSources };
  });
  const [expanded, setExpanded] = useState({ pmc: true, execution: true, sub_vendor: true, in_house: true });
  const [simulation, setSimulation] = useState<SimulatorScope | null>(null);
  const [descriptionBackup, setDescriptionBackup] = useState<{ value: KnowledgeJsonValue | undefined } | null>(null);
  const [removeRecovery, setRemoveRecovery] = useState<number | null>(null);
  const uomId = knowledgeText(overviewPayload.uomId);
  const master = masters.uoms?.find(row => row.id === uomId);
  const uom = { id: uomId, label: master?.name ?? (uomId ? "Unavailable saved UOM" : "Not set"), scale: catalogsReady ? master?.decimalScale : undefined };
  const drafts = Object.fromEntries(MODE_CALCULATION_SCOPES.map(scope => [scope, nativeCalculationDraft(values[scope])])) as Parameters<typeof KnowledgeModeSimulator>[0]["initialDrafts"];
  const descriptionSource = typeof payload.modeDescription === "string" ? payload.modeDescription : generateModeDescription(item.mainLineName, partition.primary.pmc, partition.primary.execution.in_house);
  const description = descriptionBackup === null ? syncModeDescription(descriptionSource, partition.primary.pmc, undefined, partition.primary.execution.in_house) : descriptionSource;
  const issues = [...parsed.issues, ...modeDescriptionIssues(payload.modeDescription), ...modeCalculationsIssues(payload), ...pmcMarginRangeIssues(payload), ...subVendorMarginRangeIssues(payload), ...validateKnowledgeBrands(pricingPayload.brands), ...parseKnowledgeSpecifications(pricingPayload.specifications, pricingPayload.brands ?? []).issues];
  // Decimal-scale validation is additional to JSON shape validation and applies to hidden scopes too.
  const inputIssues = MODE_CALCULATION_SCOPES.flatMap(scope => values[scope] == null ? [] : Object.values(parseModeCalculationDraft(drafts[scope], uom.scale ?? 6, scope !== "pmc" && scope !== "sub_vendor").errors));
  const valid = issues.length === 0 && inputIssues.length === 0 && descriptionBackup === null;
  useEffect(() => onValidityChange?.(valid), [valid, onValidityChange]);
  const rawRows = Array.isArray(payload.modeConfigurations) ? payload.modeConfigurations : [];
  function updateRows(rows: readonly KnowledgeJsonValue[]) {
    if (readOnly) return;
    const next = { ...payload, modeConfigurations: [...rows] };
    const nextPartition = partitionKnowledgeModeConfigurations(parseKnowledgeModeConfigurations(next.modeConfigurations, masters.modes ?? []).configurations);
    onChange(typeof payload.modeDescription === "string" ? { ...next, modeDescription: syncModeDescription(payload.modeDescription, nextPartition.primary.pmc, partition.primary.pmc, nextPartition.primary.execution.in_house, partition.primary.execution.in_house) } : next);
  }
  function updateScope(source: "sub_vendor" | "in_house", list: KnowledgePmcScopeList, rows: readonly KnowledgeJsonValue[]) {
    const configuration = source === "sub_vendor" ? partition.primary.pmc : partition.primary.execution.in_house;
    const original = rawRows.find(row => isKnowledgeObject(row) && row.id === configuration?.id);
    const next: Record<string, KnowledgeJsonValue> = isKnowledgeObject(original) ? { ...original, [list]: [...rows] } : { id: knowledgeRowId(), modeKind: source === "sub_vendor" ? "pmc" : "execution", ...(source === "in_house" ? { executionSource: "in_house" } : {}), fields: [], [list]: [...rows] };
    if (source === "in_house") for (const other of PMC_SCOPE_LISTS) if (!Object.hasOwn(next, other)) next[other] = inHouseScopeStarterItems(other).map(row => ({ ...row }));
    updateRows(original ? rawRows.map(row => row === original ? next : row) : [...rawRows, next]);
  }
  const change = (next: KnowledgeJsonObject) => { if (!readOnly) onChange(next); };
  function calculation(scope: ModeCalculationScope) {
    const usesRange = scope === "pmc" || scope === "sub_vendor";
    const range = scope === "pmc" ? pmcMarginRange(payload) : subVendorMarginRange(payload);
    const errors = values[scope] == null ? {} : parseModeCalculationDraft(drafts[scope], uom.scale ?? 6, !usesRange).errors;
    return <View style={knowledgeStyles.stack}><Text accessibilityRole="header" style={knowledgeStyles.subtitle}>{MODE_CALCULATION_LABELS[scope]} calculations</Text>
      <View style={knowledgeStyles.row}>
        <View style={knowledgeStyles.column}><NativeDecimalField label={`${MODE_CALCULATION_LABELS[scope]} Base Rate (₹)`} value={drafts[scope].baseRate} editable={!readOnly} error={errors.baseRate} keyboardType="decimal-pad" maxLength={64} onChangeText={baseRate => change(nativeCalculationChange(payload, scope, { ...drafts[scope], baseRate }, uom.scale ?? 6))} /></View>
        <View style={knowledgeStyles.column}><Field label="UOM" accessibilityLabel={`${MODE_CALCULATION_LABELS[scope]} UOM`} value={uom.label} editable={false} /></View>
      </View>
      <View style={knowledgeStyles.row}>
        <View style={knowledgeStyles.column}><NativeDecimalField label={`${MODE_CALCULATION_LABELS[scope]} Low Quantity Limit`} value={drafts[scope].lowQuantityLimit} editable={!readOnly} error={errors.lowQuantityLimit} keyboardType="decimal-pad" maxLength={64} onChangeText={lowQuantityLimit => change(nativeCalculationChange(payload, scope, { ...drafts[scope], lowQuantityLimit }, uom.scale ?? 6))} /></View>
        <View style={knowledgeStyles.column}><NativeDecimalField label={`${MODE_CALCULATION_LABELS[scope]} Impact (%)`} value={drafts[scope].impactRate} editable={!readOnly} error={errors.impactRate} keyboardType="decimal-pad" maxLength={64} onChangeText={impactRate => change(nativeCalculationChange(payload, scope, { ...drafts[scope], impactRate }, uom.scale ?? 6))} /></View>
      </View>
      <KnowledgeText>UOM follows Overview. Impact applies at or below the quantity limit.</KnowledgeText>
      <View style={knowledgeStyles.row}>{usesRange ? (["minimum", "maximum"] as const).map(field => <View style={knowledgeStyles.column} key={field}><NativeDecimalField label={`${scope === "pmc" ? "PMC" : "Lisno"} ${field === "minimum" ? "Min." : "Max."} Margin (%)`} value={typeof range[field] === "number" && Number.isSafeInteger(range[field]) && (range[field] as number) >= 0 ? formatPaiseForRupeeInput(range[field] as number) : knowledgeText(range[field])} editable={!readOnly} keyboardType="decimal-pad" maxLength={64} error={issues.find(issue => issue.path === (scope === "pmc" ? field === "minimum" ? "pmcMinimumMarginBps" : "pmcMarginBps" : field === "minimum" ? "subVendorMinimumMarginBps" : "subVendorMarginBps"))?.message} onChangeText={text => change((scope === "pmc" ? withPmcMargin : withSubVendorMargin)(payload, field, nativePercentage(text)))} /></View>)
        : ([ ["minimumRate", "Min. Gross Margin (%)"], ["startingRate", "Starting Gross Margin (%)"] ] as const).map(([field, label]) => <View style={knowledgeStyles.column} key={field}><NativeDecimalField label={`${MODE_CALCULATION_LABELS[scope]} ${label}`} value={drafts[scope][field]} editable={!readOnly} keyboardType="decimal-pad" maxLength={64} error={errors[field]} onChangeText={text => change(nativeCalculationChange(payload, scope, { ...drafts[scope], [field]: text }, uom.scale ?? 6))} /></View>)}</View>
      <KnowledgeText>{scope === "pmc" ? "Allowed: 10% to 20%, up to 2 decimal places. Min. ≤ Max." : scope === "sub_vendor" ? "Allowed: 0% to 95%, in multiples of 5%. Min. ≤ Max." : "Gross Margin must be less than 100%. Min. ≤ Starting."}</KnowledgeText>
      <Button label={`Test ${MODE_CALCULATION_LABELS[scope]} calculations`} variant="secondary" onPress={() => setSimulation(scope)} />
    </View>;
  }
  function scopeLists(source: "sub_vendor" | "in_house") {
    const configuration = source === "sub_vendor" ? partition.primary.pmc : partition.primary.execution.in_house;
    const raw = rawRows.find(row => isKnowledgeObject(row) && row.id === configuration?.id);
    return <View style={knowledgeStyles.stack}>{PMC_SCOPE_LISTS.map(list => <NativeScopeList key={list} sourceLabel={source === "sub_vendor" ? "Sub-Vendor" : "In-house"} list={list} value={isKnowledgeObject(raw) && Object.hasOwn(raw, list) ? raw[list] : source === "in_house" ? inHouseScopeStarterItems(list).map(row => ({ ...row })) : []} readOnly={readOnly} onChange={rows => updateScope(source, list, rows)} />)}</View>;
  }
  const section = (key: keyof typeof expanded, title: string, children: ReactNode) => <KnowledgeCard title={title} actions={<IconButton label={`${expanded[key] ? "Collapse" : "Expand"} ${title}`} icon={expanded[key] ? "down" : "right"} onPress={() => setExpanded(previous => ({ ...previous, [key]: !previous[key] }))} />}>{expanded[key] ? children : null}</KnowledgeCard>;
  const recoveries = rawRows.flatMap((row, index) => {
    const parsedRow = isKnowledgeObject(row) ? parsed.configurations.find(configuration => configuration.id === row.id) : undefined;
    const recovery = partition.recovery.find(entry => entry.configuration === parsedRow);
    const invalid = parsed.issues.some(issue => issue.path === `modeConfigurations.${index}` || issue.path.startsWith(`modeConfigurations.${index}.`));
    return recovery || invalid || !parsedRow ? [{ row, index, configuration: parsedRow, reason: recovery?.reason }] : [];
  });
  return <View style={knowledgeStyles.stack}>
    <KnowledgeCard title="Mode">
      <View style={knowledgeStyles.row}><KnowledgeChoice multiple label="PMC" selected={visible.pmc} onPress={() => setVisible(previous => ({ ...previous, pmc: !previous.pmc }))} /><KnowledgeChoice multiple label="Execution" selected={visible.execution} onPress={() => setVisible(previous => ({ ...previous, execution: !previous.execution }))} /></View>
      <KnowledgeText>Hidden settings are retained.</KnowledgeText>
      {issues.length || inputIssues.length ? <KnowledgeText error>{[...issues.map(issue => issue.message), ...inputIssues].filter((text, index, all) => all.indexOf(text) === index).join("\n")}</KnowledgeText> : null}
      {visible.pmc || visible.execution ? <View style={knowledgeStyles.stack}><View style={knowledgeStyles.row}><Text style={[knowledgeStyles.subtitle, { flex: 1 }]}>Shared description</Text>{!readOnly && descriptionBackup === null ? <IconButton label="Edit Mode paragraph" icon="edit" onPress={() => setDescriptionBackup({ value: payload.modeDescription })} /> : null}</View>
        {descriptionBackup === null ? <KnowledgeText>{description}</KnowledgeText> : <><Field label="Mode paragraph" value={description} multiline editable={!readOnly} maxLength={4000} onChangeText={modeDescription => change({ ...payload, modeDescription })} /><View style={knowledgeStyles.row}>
          <Button label="Cancel paragraph" variant="quiet" onPress={() => { const next = { ...payload }; if (descriptionBackup.value === undefined) delete next.modeDescription; else next.modeDescription = typeof descriptionBackup.value === "string" ? syncModeDescription(descriptionBackup.value, partition.primary.pmc, undefined, partition.primary.execution.in_house) : descriptionBackup.value; change(next); setDescriptionBackup(null); }} />
          <Button label="Apply paragraph" disabled={readOnly || modeDescriptionIssues(description).length > 0} onPress={() => { change({ ...payload, modeDescription: syncModeDescription(description, partition.primary.pmc, undefined, partition.primary.execution.in_house) }); setDescriptionBackup(null); }} />
        </View></>}
      </View> : null}
    </KnowledgeCard>
    {visible.pmc ? section("pmc", "PMC", calculation("pmc")) : null}
    {visible.execution ? section("execution", "Execution", <>
      <KnowledgeText>Execution source. Select one or both; each keeps its own settings.</KnowledgeText>
      <View style={knowledgeStyles.row}><KnowledgeChoice multiple label="Sub-Vendor" selected={visible.sub_vendor} onPress={() => setVisible(previous => ({ ...previous, sub_vendor: !previous.sub_vendor }))} /><KnowledgeChoice multiple label="In-house" selected={visible.in_house} onPress={() => setVisible(previous => ({ ...previous, in_house: !previous.in_house }))} /></View>
      {visible.sub_vendor ? section("sub_vendor", "Sub-Vendor", <>{scopeLists("sub_vendor")}{calculation("sub_vendor")}</>) : null}
      {visible.in_house ? section("in_house", "In-house", <>{scopeLists("in_house")}{calculation("in_house_labor")}{calculation("in_house_material")}<Button label="Test In-house total" variant="secondary" onPress={() => setSimulation("in_house_total")} /></>) : null}
    </>) : null}
    {recoveries.length ? <KnowledgeCard title="Saved Mode configurations needing recovery"><KnowledgeText>These historical definitions remain separate until explicitly moved or removed.</KnowledgeText>
      {recoveries.map(({ row, index, configuration, reason }) => <KnowledgeCard key={index} title={`Saved configuration ${index + 1}`}>
        {configuration ? <LegacyFields configuration={configuration} /> : <KnowledgeText>Unsupported saved data is retained.</KnowledgeText>}
        {reason === "unresolved" ? <KnowledgeText>Legacy Mode could not be resolved. Check the reusable Mode catalog.</KnowledgeText> : null}
        {!readOnly ? <View style={knowledgeStyles.row}>
          {reason === "unscoped_execution" && isKnowledgeObject(row) ? (["sub_vendor", "in_house"] as const).map(source => <Button key={source} label={`Move to ${source === "sub_vendor" ? "Sub-Vendor" : "In-house"}`} variant="secondary" disabled={!catalogsReady || !!partition.primary.execution[source]} onPress={() => { const next = { ...row, modeKind: "execution", executionSource: source }; delete (next as Record<string, unknown>).modeId; updateRows(rawRows.map((entry, rowIndex) => rowIndex === index ? next : entry)); setVisible(previous => ({ ...previous, execution: true, [source]: true })); }} />) : null}
          <Button label={`Remove saved configuration ${index + 1}`} variant="danger" onPress={() => setRemoveRecovery(index)} />
        </View> : null}
      </KnowledgeCard>)}
    </KnowledgeCard> : null}
    <KnowledgeSpecificationsEditor payload={pricingPayload} onChange={onPricingChange} readOnly={readOnly} protectedIds={referencedSpecificationIds} />
    {simulation ? <KnowledgeModeSimulator key={`${context.scopeKey}:${simulation}:${uom.id}`} scope={simulation} context={context} payload={payload} initialDrafts={drafts} uom={uom} onClose={() => setSimulation(null)} /> : null}
    {removeRecovery !== null ? <KnowledgeModal title="Remove saved configuration?" onClose={() => setRemoveRecovery(null)}><KnowledgeText>Its components will be removed from the draft. Calculation and margin settings remain.</KnowledgeText><Button label="Remove configuration" variant="danger" disabled={readOnly} onPress={() => { updateRows(rawRows.filter((_, index) => index !== removeRecovery)); setRemoveRecovery(null); }} /></KnowledgeModal> : null}
  </View>;
}

function LegacyFields({ configuration }: { readonly configuration: KnowledgeModeConfiguration }) { return <>{!configuration.fields.length ? <KnowledgeText>No saved components.</KnowledgeText> : configuration.fields.map(field => <KnowledgeText key={field.id}>{field.label || "Unnamed component"} ({field.type}): {field.value === null ? "Not configured" : String(field.value)}{field.options.length ? `; options: ${field.options.join(", ")}` : ""}</KnowledgeText>)}</>; }

function NativeScopeList({ sourceLabel, list, value, readOnly, onChange }: { readonly sourceLabel: string; readonly list: KnowledgePmcScopeList; readonly value: KnowledgeJsonValue | undefined; readonly readOnly: boolean; readonly onChange: (rows: readonly KnowledgeJsonValue[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const rows = Array.isArray(value) ? value : [];
  const label = list === "inclusions" ? "Inclusions" : "Exclusions";
  const singular = list === "inclusions" ? "Inclusion" : "Exclusion";
  const duplicate = rows.some(row => isKnowledgeObject(row) && normalizePmcScopeName(knowledgeText(row.name)) === normalizePmcScopeName(name));
  return <KnowledgeCard title={label} actions={!readOnly ? <IconButton label={`Add ${sourceLabel} ${singular}`} icon="add" disabled={rows.length >= MAX_PMC_SCOPE_ITEMS || (value !== undefined && !Array.isArray(value))} onPress={() => setAdding(true)} /> : null}>
    {!rows.length ? <KnowledgeText>No {list} added.</KnowledgeText> : null}
    {rows.map((row, index) => isKnowledgeObject(row) ? <View key={`${knowledgeText(row.id)}:${index}`} style={knowledgeStyles.row}>
      <View style={{ flex: 1 }}><KnowledgeChoice label={`${sourceLabel} ${singular}: ${knowledgeText(row.name)}`} multiple selected={row.selected === true} disabled={readOnly} onPress={() => onChange(rows.map((entry, rowIndex) => rowIndex === index ? { ...row, selected: row.selected !== true } : entry))} /></View>
      {!readOnly ? <IconButton label={`Remove ${sourceLabel} ${singular} ${index + 1}`} icon="close" onPress={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} /> : null}
    </View> : <KnowledgeText key={index} error>Unsupported saved {singular.toLowerCase()} retained.</KnowledgeText>)}
    {adding ? <><Field label={`${sourceLabel} ${singular} name`} value={name} maxLength={240} onChangeText={setName} error={duplicate ? "Names must be unique within each list." : undefined} /><View style={knowledgeStyles.row}><Button label={`Cancel new ${singular}`} variant="quiet" onPress={() => { setAdding(false); setName(""); }} /><Button label={`Add ${singular}`} disabled={readOnly || !name.trim() || duplicate || rows.length >= MAX_PMC_SCOPE_ITEMS} onPress={() => { if (readOnly || !name.trim() || duplicate) return; onChange([...rows, { id: knowledgeRowId(), name: name.trim(), selected: false }]); setAdding(false); setName(""); }} /></View></> : null}
  </KnowledgeCard>;
}

/** Keep the caret and entered decimal text stable while the parent stores exact paise/bps. */
function NativeDecimalField({ value = "", onChangeText, ...props }: ComponentProps<typeof Field>) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(current => current === value || (parseModeQuantity(current, 18) !== undefined && parseModeQuantity(current, 18) === parseModeQuantity(value, 18)) ? current : value);
  }, [value]);
  return <Field {...props} label={props.label.replace(/^(PMC|Sub-Vendor|In-house labor|In-house material|In-house Labour|In-house Material|Labor cost|Material cost|Lisno) /i, "")} accessibilityLabel={props.label} value={text} onChangeText={next => { setText(next); onChangeText?.(next); }} />;
}
