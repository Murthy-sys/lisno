import { EstimateSubBasketModes } from "../estimates/EstimateSubBasketModes";
import type { EstimateTierComparisonInput } from "../estimates/estimateTierComparisonApi";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing } from "../../../../shared/estimation/estimateComponentPricing";
import { EstimateComponentBreakdown } from "../leads/EstimateComponentBreakdown";
import { calculateDimensionQuantity, estimateDimensionRulesEqual, type EstimateDimensions, type EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import { EstimateDimensionsFields, emptyEstimateDimensions } from "../leads/EstimateDimensionsFields";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { refreshEstimateCollaboration } from "../leads/estimateCollaborationQueries";
import {
  estimateTiersKeys, getEstimateTiers, updateEstimateTier, updateEstimateTierGroup, updateEstimateDimensions,
  type EstimateTierChoice, type EstimateTierLine, type EstimateTierSource, type EstimateTiersDetail, type UpdateEstimateTierInput, type UpdateEstimateTierGroupInput, type UpdateEstimateDimensionsInput
} from "./estimateTiersApi";
import "./clientEstimateTiers.css";

interface TierLineDraft {
  modeTier: KnowledgeModeTier;
  selectedInHouseComponentIds: string[];
  source: EstimateTierSource;
}
interface TierDraft {
  groupKey: string;
  mode: "mode" | KnowledgeModeTier;
  expectedVersion: number;
  lines: Record<string, TierLineDraft>;
  originals: Record<string, TierLineDraft>;
}
interface TierGroup { key: string; label: string; lines: EstimateTierLine[] }
const groupKey = (line: EstimateTierLine) => JSON.stringify([line.roomId ?? line.roomName, line.mainBasketId ?? null, line.subBasketId ?? null]);
const tierLineDraft = (line: EstimateTierLine): TierLineDraft | null => {
  const source = line.choices.find(choice => choice.modeTier === line.modeTier)?.source;
  return source ? { modeTier: line.modeTier, selectedInHouseComponentIds: [...(line.selectedInHouseComponentIds ?? [])], source } : null;
};
interface DimensionsDraft {
  lineId: string;
  expectedVersion: number;
  source: EstimateTierSource;
  rule: EstimateDimensionRule;
  dimensions: EstimateDimensions;
  needsReview: boolean;
}
type WorkingEstimateCommand = { kind: "tier"; lineId: string; input: UpdateEstimateTierInput }
  | { kind: "group"; input: UpdateEstimateTierGroupInput }
  | { kind: "dimensions"; lineId: string; input: UpdateEstimateDimensionsInput };
const measurementSource = (line: EstimateTierLine | undefined) => line?.choices.find(choice => choice.source)?.source;
const money = (value: number | null) => value !== null && Number.isSafeInteger(value) && value >= 0
  ? `₹${(value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "Not configured";
const sameSource = (left: EstimateTierSource, right: EstimateTierSource | null | undefined) => Boolean(right
  && left.revisionId === right.revisionId && left.itemVersion === right.itemVersion
  && left.revisionVersion === right.revisionVersion && left.uomId === right.uomId);
const componentAmount = (line: EstimateTierLine, value: EstimateTierLine | EstimateTierChoice) => {
  if (line.pricingMode !== "in_house" || value.pricingBasis !== ESTIMATE_COMPONENT_PRICING_BASIS) return null;
  const pricing = readEstimateComponentPricing(value.componentPricing);
  return pricing && pricing.mainLineId === line.mainLineId && Number(pricing.quantity) === line.quantity &&
    pricing.modeTier === value.modeTier && pricing.totalPaise === value.amountPaise ? pricing : null;
};

export function ClientEstimateTiers({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<TierDraft | null>(null);
  const [dimensionsDraft, setDimensionsDraft] = useState<DimensionsDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const query = useQuery({ queryKey: estimateTiersKeys.detail(projectId), queryFn: () => getEstimateTiers(projectId), enabled: Boolean(projectId) });
  const action = useMutation({
    mutationFn: (command: WorkingEstimateCommand) => command.kind === "dimensions"
      ? updateEstimateDimensions(projectId, command.lineId, command.input) : command.kind === "group" ? updateEstimateTierGroup(projectId, command.input) : updateEstimateTier(projectId, command.lineId, command.input),
    onMutate: async () => { setNotice(""); await client.cancelQueries({ queryKey: estimateTiersKeys.detail(projectId), exact: true }); },
    onSuccess: async (detail, command) => {
      client.setQueryData<EstimateTiersDetail>(estimateTiersKeys.detail(projectId), current =>
        current?.estimateId === detail.estimateId && (current.estimateVersion ?? -1) > (detail.estimateVersion ?? -1) ? current : detail);
      setDraft(null); setDimensionsDraft(null); setConflict(false); setNotice(command.kind === "dimensions"
        ? "Your dimensions are saved in the working estimate. Submitted estimates keep their recorded values."
        : "Your tier selection is saved in the working estimate. Submitted estimates keep their recorded values.");
      await Promise.allSettled([refreshEstimateCollaboration(client), client.invalidateQueries({ queryKey: estimateTiersKeys.detail(projectId) })]);
    },
    onError: async error => {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setAccessDenied(true);
      if (error instanceof ApiError && error.status === 409 && error.code !== "ESTIMATE_DIMENSIONS_PRICE_CHANGED") setConflict(true);
      await query.refetch();
    },
    onSettled: () => { submitting.current = false; }
  });

  const refresh = async () => {
    const result = await query.refetch();
    if (result.isSuccess) { setAccessDenied(false); action.reset(); }
  };
  if (query.isPending) return <section className="client-estimate-tiers" aria-label="Working estimate tiers"><h2>Working estimate tiers</h2><p role="status">Loading current estimate choices…</p></section>;
  if (query.isError || accessDenied || !query.data) return <section className="client-estimate-tiers" aria-label="Working estimate tiers"><h2>Working estimate tiers</h2>
    <p role="alert">Current estimate choices are unavailable. Refresh before making changes.</p><Button variant="secondary" disabled={query.isFetching} onClick={() => void refresh()}>Refresh choices</Button></section>;

  const detail = query.data;
  const grouped = new Map<string, TierGroup>();
  for (const line of detail.lines) {
    const key = groupKey(line);
    const group = grouped.get(key) ?? { key, label: `${line.subBasketName ?? (line.mainBasketName ? `Direct items in ${line.mainBasketName}` : "Items")} in ${line.roomName}`, lines: [] };
    group.lines.push(line); grouped.set(key, group);
  }
  const groups = [...grouped.values()];
  const dimensionsPriceChanged = action.error instanceof ApiError && action.error.code === "ESTIMATE_DIMENSIONS_PRICE_CHANGED";
  const measurementLine = dimensionsDraft ? detail.lines.find(line => line.id === dimensionsDraft.lineId) : undefined;
  const measurementsStale = Boolean(dimensionsDraft && (dimensionsDraft.expectedVersion !== detail.estimateVersion ||
    !sameSource(dimensionsDraft.source, measurementSource(measurementLine)) || !measurementLine?.dimensionsMandatory ||
    !estimateDimensionRulesEqual(dimensionsDraft.rule, measurementLine.dimensionRule)));
  const draftEntries = Object.entries(draft?.lines ?? {}).map(([id, selection]) => {
    const line = detail.lines.find(value => value.id === id);
    return { id, selection, line, choice: line?.choices.find(choice => choice.modeTier === selection.modeTier) };
  });
  const stale = Boolean(draft && (draft.expectedVersion !== detail.estimateVersion || draftEntries.some(entry => !sameSource(entry.selection.source, entry.choice?.source))));
  const needsReview = conflict || stale || measurementsStale;
  const pending = action.isPending || submitting.current;
  const mayEdit = detail.editingAllowed && detail.estimateVersion !== null && !pending && !query.isFetching;
  const validDraft = draftEntries.length > 0 && draftEntries.every(entry => entry.choice?.available && entry.choice.source &&
    validComponents(entry.line, entry.choice, entry.selection.selectedInHouseComponentIds));
  const select = (line: EstimateTierLine, choice: EstimateTierChoice, selected: string[]) => {
    const key = groupKey(line);
    if (dimensionsDraft || !mayEdit || !choice.available || !choice.source || needsReview || draft && draft.groupKey !== key) return;
    action.reset(); setNotice("");
    setDraft({ groupKey: key, mode: draft?.mode ?? "mode", expectedVersion: draft?.expectedVersion ?? detail.estimateVersion!,
      lines: { ...draft?.lines, [line.id]: { modeTier: choice.modeTier, source: choice.source, selectedInHouseComponentIds: selected } },
      originals: draft?.originals ?? {} });
  };
  const selectGroup = (group: TierGroup, mode: "mode" | KnowledgeModeTier) => {
    if (!mayEdit || needsReview || dimensionsDraft || draft && draft.groupKey !== group.key) return;
    if (mode === "mode") {
      if (!draft) return;
      const restored = Object.fromEntries(Object.entries(draft.originals).filter(([id, original]) => {
        const line = group.lines.find(value => value.id === id);
        return line && JSON.stringify(original) !== JSON.stringify(tierLineDraft(line));
      }));
      setDraft(Object.keys(restored).length ? { ...draft, mode, lines: restored, originals: {} } : null);
      action.reset(); return;
    }
    const current = Object.fromEntries(group.lines.flatMap(line => {
      const choice = draft?.lines[line.id] ?? tierLineDraft(line);
      return choice ? [[line.id, choice]] : [];
    }));
    const lines: Record<string, TierLineDraft> = {};
    for (const line of group.lines) {
      const choice = line.choices.find(value => value.modeTier === mode);
      if (!choice?.available || !choice.source) return;
      lines[line.id] = { modeTier: mode, source: choice.source,
        selectedInHouseComponentIds: current[line.id]?.modeTier === mode ? [...current[line.id]!.selectedInHouseComponentIds] : [] };
    }
    action.reset(); setNotice("");
    setDraft({ groupKey: group.key, mode, expectedVersion: draft?.expectedVersion ?? detail.estimateVersion!, lines,
      originals: draft?.mode && draft.mode !== "mode" ? draft.originals : current });
  };
  const reviewLatest = () => {
    if (!draft || !mayEdit || draftEntries.some(entry => !entry.choice?.available || !entry.choice.source)) return;
    setDraft({ ...draft, expectedVersion: detail.estimateVersion!, lines: Object.fromEntries(draftEntries.map(entry =>
      [entry.id, { ...entry.selection, source: entry.choice!.source! }])) });
    setConflict(false); action.reset();
  };
  const save = () => {
    if (!draft || !mayEdit || needsReview || !validDraft) return;
    const lines = draftEntries.map(entry => ({ lineItemId: entry.id, modeTier: entry.selection.modeTier, ...entry.selection.source,
      ...(entry.line?.pricingMode === "in_house" && entry.choice?.inHouseComponents !== undefined ? { selectedInHouseComponentIds: entry.selection.selectedInHouseComponentIds } : {}) }));
    submitting.current = true;
    if (lines.length === 1) {
      const { lineItemId, ...selection } = lines[0]!;
      action.mutate({ kind: "tier", lineId: lineItemId, input: { expectedVersion: draft.expectedVersion, ...selection } });
    } else action.mutate({ kind: "group", input: { expectedVersion: draft.expectedVersion, lines } });
  };

  const startDimensions = (line: EstimateTierLine) => {
    const source = measurementSource(line);
    if (!mayEdit || draft || dimensionsDraft || !source || !line.dimensionsMandatory || !line.dimensionRule) return;
    setConflict(false); setNotice(""); action.reset();
    setDimensionsDraft({ lineId: line.id, expectedVersion: detail.estimateVersion!, source,
      rule: line.dimensionRule, dimensions: line.dimensions ? { ...line.dimensions } : emptyEstimateDimensions(), needsReview: Boolean(line.dimensionsNeedReview) });
  };
  const reviewLatestDimensions = () => {
    const source = measurementSource(measurementLine);
    if (!dimensionsDraft || !mayEdit || !measurementLine?.dimensionsMandatory || !measurementLine.dimensionRule || !source) return;
    setDimensionsDraft({ ...dimensionsDraft, source, expectedVersion: detail.estimateVersion!, rule: measurementLine.dimensionRule, needsReview: true });
    setConflict(false); action.reset();
  };
  const saveDimensions = () => {
    if (!dimensionsDraft || !mayEdit || needsReview || dimensionsDraft.needsReview || dimensionsPriceChanged) return;
    const calculated = calculateDimensionQuantity(dimensionsDraft.rule, dimensionsDraft.dimensions);
    if (!calculated) return;
    submitting.current = true;
    action.mutate({ kind: "dimensions", lineId: dimensionsDraft.lineId, input: {
      expectedVersion: dimensionsDraft.expectedVersion, ...dimensionsDraft.source, expectedDimensionRule: dimensionsDraft.rule, dimensions: calculated.dimensions
    } });
  };

  return <section className="client-estimate-tiers" aria-labelledby={`estimate-tiers-${projectId}`}>
    <header className="client-estimate-tiers__header"><div><h2 id={`estimate-tiers-${projectId}`}>Working estimate tiers</h2><p>Choose a mode beside each Sub Basket and enter required item dimensions. Your team’s submitted estimate remains separate below.</p></div>
      <dl>{!detail.isIncomplete && detail.roundOffPaise !== undefined && detail.roundOffPaise !== 0 ? <><dt>Round off</dt><dd>{detail.roundOffPaise < 0 ? "−" : "+"}{money(Math.abs(detail.roundOffPaise))}</dd></> : null}<dt>Current total including GST</dt><dd>{detail.isIncomplete ? "Incomplete" : money(detail.totalPaise)}</dd></dl></header>
    {!detail.editingAllowed ? <p role="status">{detail.editingBlockReason === "review_pending" ? "A submitted estimate is awaiting review. Request changes below before changing tiers."
      : detail.editingBlockReason === "not_started" ? "Your team has not started the estimate yet." : "This estimate is closed for changes."}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {action.isError ? <p role="alert">{dimensionsPriceChanged
      ? "The configured price changed. Ask Sales to review this item before saving dimensions. Your measurements are preserved."
      : dimensionsDraft
      ? needsReview ? "The estimate or measurement rule changed. Your dimensions are preserved. Review the latest rule before saving." : "Your dimensions could not be saved. They are preserved; try again."
      : needsReview ? "The estimate or configuration changed. Your selection is preserved. Review the latest choices before saving."
      : "Your selection could not be saved. It is preserved; try again."}</p> : null}
    {needsReview && !dimensionsDraft ? <div className="client-estimate-tiers__actions"><p role="status">Review the latest estimate and prices before applying your selection.</p>
      <Button variant="secondary" disabled={!mayEdit || draftEntries.some(entry => !entry.choice?.available || !entry.choice.source)} onClick={reviewLatest}>Use latest choices</Button></div> : null}
    {(draftEntries.some(entry => !entry.line) || dimensionsDraft && !measurementLine) ? <p role="status">This item is no longer available. Cancel your selection to continue.</p> : null}
    {!detail.lines.length ? <p>No client-visible items are currently available for tier selection.</p> : null}
    {groups.map(group => {
      const first = group.lines[0]!;
      const options = KNOWLEDGE_MODE_TIERS.map(tier => {
        const unavailable = group.lines.filter(line => !line.choices.some(choice => choice.modeTier === tier && choice.available && choice.source));
        return { tier, available: unavailable.length === 0, reason: unavailable.length ? `${unavailable.length} ${unavailable.length === 1 ? "item is" : "items are"} unavailable in this mode.` : null };
      });
      const descriptors = group.lines.map(line => {
        const selected = draft?.groupKey === group.key ? draft.lines[line.id] : undefined;
        const source = selected?.source ?? measurementSource(line);
        return source && line.pricingMode ? { mainLineId: line.mainLineId, lineItemId: line.id, ...source, quantity: line.quantity,
          pricingMode: line.pricingMode, modeTier: selected?.modeTier ?? line.modeTier, ...(selected ? { rateSource: "configuration" as const } : {}),
          selectedInHouseComponentIds: selected?.selectedInHouseComponentIds ?? line.selectedInHouseComponentIds ?? [],
          ...(line.dimensionsMandatory && line.dimensions ? { dimensions: line.dimensions, ...(line.dimensionRule ? { expectedDimensionRule: line.dimensionRule } : {}) } : {}) } : null;
      });
      const comparison: EstimateTierComparisonInput | undefined = first.mainBasketId && first.roomId && descriptors.every(value => value !== null)
        ? { expectedVersion: detail.estimateVersion ?? undefined, mainBasketId: first.mainBasketId, subBasketId: first.subBasketId ?? null,
          roomId: first.roomId, lines: descriptors.filter((value): value is NonNullable<typeof value> => value !== null) } : undefined;
      return <section key={group.key} aria-label={group.label} className="client-estimate-tiers__group"><h3>{group.label}</h3>
        <EstimateSubBasketModes label={group.label} value={draft?.groupKey === group.key && draft.mode !== "mode" && group.lines.every(line => (draft.lines[line.id]?.modeTier ?? line.modeTier) === draft.mode) ? draft.mode : "mode"} options={options}
          readOnly={!detail.editingAllowed} disabled={!mayEdit || needsReview || Boolean(dimensionsDraft) || Boolean(draft && draft.groupKey !== group.key) ||
            group.lines.some(line => line.dimensionsMandatory && (line.dimensionsNeedReview || !calculateDimensionQuantity(line.dimensionRule, line.dimensions)))}
          onChange={mode => selectGroup(group, mode)} comparison={comparison ? { target: { kind: "project", id: projectId }, input: comparison } : undefined}
          detailsDisabledReason={comparison ? undefined : "Current source details are unavailable for these items."} />
      {group.lines.map(line => {
      const selectedDraft = draft?.lines[line.id];
      const editing = Boolean(selectedDraft);
      const tier = selectedDraft?.modeTier ?? line.modeTier;
      const choice = line.choices.find(row => row.modeTier === tier);
      const selected = selectedDraft?.selectedInHouseComponentIds ?? line.selectedInHouseComponentIds ?? [];
      const dimensionsRequired = Boolean(line.dimensionsMandatory && (line.dimensionsNeedReview || !calculateDimensionQuantity(line.dimensionRule, line.dimensions)));
      const disabled = !mayEdit || needsReview || dimensionsRequired || Boolean(dimensionsDraft) || Boolean(draft && draft.groupKey !== group.key);
      const label = `${line.mainLineName} in ${line.roomName}`;
      return <div className="client-estimate-tiers__line" key={line.id}>
        <div className="client-estimate-tiers__line-heading"><div><h3>{line.mainLineName}</h3><p>{line.roomName} · {line.quantity} {line.uomName}</p></div><p>Saved amount <strong>{money(line.amountPaise)}</strong></p></div>
        {line.dimensionsMandatory ? dimensionsDraft?.lineId === line.id ? <div>
          <EstimateDimensionsFields label={label} dimensions={dimensionsDraft.dimensions} rule={dimensionsDraft.rule} quantityUnit={line.uomName}
            disabled={!mayEdit || needsReview} needsReview={dimensionsDraft.needsReview}
            onChange={dimensions => setDimensionsDraft({ ...dimensionsDraft, dimensions })}
            onConfirm={() => setDimensionsDraft({ ...dimensionsDraft, needsReview: false })} />
        </div> : <div className="client-estimate-tiers__measurements">
          {line.dimensions ? <p>{line.dimensionsNeedReview ? "Recorded dimensions need review." : `Dimensions: ${line.dimensions.length} × ${line.dimensions.width} × ${line.dimensions.height} ${line.dimensionRule?.inputUnit ?? ""} (L × W × H)`}</p> : <p>Length, width and height are required.</p>}
          {detail.editingAllowed ? <Button variant="secondary" disabled={!mayEdit || Boolean(draft || dimensionsDraft) || !line.dimensionRule || !measurementSource(line)} onClick={() => startDimensions(line)}>{line.dimensions ? "Edit dimensions" : "Enter dimensions"} for {line.mainLineName}</Button> : null}
          {!line.dimensionRule ? <p>A matching area unit must be configured before dimensions can be entered.</p> : null}
        </div> : null}
        {dimensionsRequired && !dimensionsDraft ? <p>Save required dimensions before choosing a tier.</p> : null}
        {line.pricingMode === "in_house" && choice?.inHouseComponents !== undefined ? <fieldset className="client-estimate-tiers__components" disabled={disabled} aria-label={`In-house components for ${label}`}><legend>Included components</legend>
          {choice.inHouseComponents.map(component => <label key={component.id}><input type="checkbox" checked={selected.includes(component.id)} disabled={!component.available && !selected.includes(component.id)}
            onChange={event => select(line, choice, event.target.checked ? [...selected, component.id] : selected.filter(id => id !== component.id))} /><span>{component.label} <small>{component.available ? component.amountPaise !== undefined ? `${money(component.amountPaise)} for this quantity` : `${money(component.ratePaise)} base reference` : "Unavailable"}</small></span></label>)}
          {selected.filter(id => !choice.inHouseComponents!.some(component => component.id === id)).map((id, index) => <label key={id}><input type="checkbox" checked onChange={() => select(line, choice, selected.filter(value => value !== id))} /><span>Unavailable selected component {index + 1}</span></label>)}
          {editing && !validComponents(line, choice, selected) ? <p>Choose at least one available component with configured pricing.</p> : null}
        </fieldset> : null}
        {componentAmount(line, line) ? <EstimateComponentBreakdown pricing={componentAmount(line, line)!} label={label} /> : null}
        {editing ? <p>{line.pricingMode === "in_house" && choice?.inHouseComponents !== undefined ? "The server will calculate the amount for your selected components when saved." : `Selected amount: ${money(choice?.amountPaise ?? null)}`}</p> : null}
      </div>;
    })}</section>;
    })}
    {dimensionsDraft ? <div className="client-estimate-tiers__actions">
      {dimensionsPriceChanged ? <Button variant="secondary" disabled={pending || query.isFetching} onClick={() => void query.refetch()}>Check for Sales update</Button> : null}
      {needsReview && (!dimensionsPriceChanged || detail.estimateVersion !== dimensionsDraft.expectedVersion) ? <><p role="status">The estimate or measurement rule changed. Your dimensions are preserved. Review the latest source before saving.</p>
        <Button variant="secondary" disabled={!mayEdit || !measurementLine?.dimensionRule || !measurementLine.dimensionsMandatory || !measurementSource(measurementLine)} onClick={reviewLatestDimensions}>Use latest measurement rule</Button></> : null}
      <Button disabled={!mayEdit || needsReview || dimensionsPriceChanged || dimensionsDraft.needsReview || !calculateDimensionQuantity(dimensionsDraft.rule, dimensionsDraft.dimensions)} busy={action.isPending} onClick={saveDimensions}>Save dimensions</Button>
      <Button variant="secondary" disabled={pending} onClick={() => { setDimensionsDraft(null); setConflict(false); action.reset(); }}>Cancel dimensions</Button>
    </div> : null}
    {draft ? <div className="client-estimate-tiers__actions"><Button disabled={!mayEdit || needsReview || draftEntries.some(entry => !entry.choice?.available || !entry.choice.source) || !validDraft} busy={action.isPending} onClick={save}>Save tier selection</Button>
      <Button variant="secondary" disabled={pending} onClick={() => { setDraft(null); setConflict(false); action.reset(); }}>Cancel selection</Button></div> : null}
  </section>;
}

function validComponents(line: EstimateTierLine | undefined, choice: EstimateTierChoice, selected: readonly string[]) {
  if (!line || line.pricingMode !== "in_house" || choice.inHouseComponents === undefined) return Boolean(line);
  return selected.length > 0 && new Set(selected).size === selected.length && selected.every(id => choice.inHouseComponents!.some(component => component.id === id && component.available && (component.amountPaise !== undefined ? component.amountPaise !== null : component.ratePaise !== null)));
}
