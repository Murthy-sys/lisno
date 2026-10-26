import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import {
  copyInHouseComponentConfiguration, LEGACY_IN_HOUSE_COMPONENT_ID, legacyInHouseComponent, MAX_IN_HOUSE_COMPONENTS, parseInHouseComponents,
  withInHouseComponents, type KnowledgeInHouseComponent
} from "../../../../shared/knowledge/knowledgeInHouseComponents";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeModeCalculationEditor, type KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import { KnowledgeInHouseTotal } from "./KnowledgeInHouseTotal";
import { KnowledgePmcScopeChecklist } from "./KnowledgePmcScopeChecklist";
import { KnowledgeSubBasketRequestPanel } from "./KnowledgeSubBasketRequestPanel";
import type { KnowledgeEditorDataSource } from "./knowledgeEditorDataSource";
import type { KnowledgePendingCalculation } from "./knowledgeModePendingChanges";
import { formatKnowledgeMoney } from "./knowledgePresentation";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";
import "./knowledge-in-house-components.css";

export type InHousePendingCalculations = Readonly<Record<string, KnowledgePendingCalculation | null>>;
export const inHouseCalculationKey = (id: string, cost: "labor" | "material") => `${id}:${cost}`;
const IN_HOUSE_DRAG_TYPE = "application/x-lisno-in-house-configuration";
const UNFINISHED_SOURCE_MESSAGE = "Finish the existing configuration inputs before copying.";
interface InHouseCopySource { readonly sourceId: string; readonly scope: string; readonly payloadStamp: string; readonly sourceStamp: string }
interface InHouseCopyGesture extends InHouseCopySource { readonly token: string }
const hasCopyableConfiguration = (component: KnowledgeInHouseComponent) => component.id === LEGACY_IN_HOUSE_COMPONENT_ID || component.labor !== null || component.material !== null
  || component.inclusions.length > 0 || component.exclusions.length > 0;
const scopePendingKey = (id: string, list: "inclusions" | "exclusions") => `${id}:${list}`;
function interactiveDragOrigin(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest("[data-in-house-drag-handle]")) return false;
  return Boolean(target.closest('input, textarea, select, button, a, label, [role="button"], [role="textbox"], [contenteditable]:not([contenteditable="false"])'));
}

export function KnowledgeInHouseComponents({ payload, item, baskets, dataSource, uom, readOnly, validationAttempt, pendingSaveVersion, issues, onChange, onSaveComponent, onValidationChange, onPendingChange, onRequestDraft, emptyCalculationDefaults = false }: {
  readonly emptyCalculationDefaults?: boolean;
  readonly payload: KnowledgeJsonObject;
  readonly item: KnowledgeItemDetail;
  readonly baskets: readonly KnowledgeBasket[];
  readonly dataSource: KnowledgeEditorDataSource;
  readonly uom: KnowledgeModeCalculationUom;
  readonly readOnly: boolean;
  readonly onRequestDraft?: () => void;
  readonly validationAttempt: number;
  readonly pendingSaveVersion: number;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly onSaveComponent: (payload: KnowledgeJsonObject) => Promise<boolean>;
  readonly onValidationChange: (valid: boolean) => void;
  readonly onPendingChange: (pending: InHousePendingCalculations) => void;
}) {
  const explicit = Object.hasOwn(payload, "inHouseComponents");
  const parsed = useMemo(() => parseInHouseComponents(payload.inHouseComponents), [payload.inHouseComponents]);
  const components = parsed.components;
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([LEGACY_IN_HOUSE_COMPONENT_ID]);
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, KnowledgePendingCalculation | null>>({});
  const [notice, setNotice] = useState("");
  const [scopePending, setScopePending] = useState<Record<string, boolean>>({});
  const [editorEpochs, setEditorEpochs] = useState<Record<string, number>>({});
  const [copyPicker, setCopyPicker] = useState<InHouseCopySource | null>(null);
  const copyReturnFocus = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragRef = useRef<InHouseCopyGesture | null>(null);
  const dragOrigin = useRef<{ sourceId: string; scope: string; blocked: boolean } | null>(null);
  const copyInstructionId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterAdd = useRef<string | null>(null);
  const focusAfterCopy = useRef<string | null>(null);
  const source = explicit ? components.find(({ id }) => id === LEGACY_IN_HOUSE_COMPONENT_ID) : undefined;
  const sourceBlockReasons: Record<string, string | null> = Object.fromEntries(components.map((component) => {
    const unfinished = (["labor", "material"] as const).some((cost) => {
      const key = inHouseCalculationKey(component.id, cost);
      return Boolean(pending[key]?.invalidFields.length) || validity[key] === false;
    }) || scopePending[scopePendingKey(component.id, "inclusions")] || scopePending[scopePendingKey(component.id, "exclusions")];
    return [component.id, unfinished ? component.id === LEGACY_IN_HOUSE_COMPONENT_ID ? UNFINISHED_SOURCE_MESSAGE : "Finish this component’s inputs before copying."
      : parsed.issues.length ? "Review the component configuration before copying." : null];
  }));
  const copyScope = JSON.stringify([item.mainLineId, item.basketId, item.subBasketId,
    item.draftRevision?.id ?? item.activeRevision?.id ?? item.draftRevisionId ?? item.activeRevisionId,
    item.version, dataSource.scopeKey, uom.scopeKey, uom.id, uom.decimalScale, pendingSaveVersion]);
  const payloadStamp = JSON.stringify(payload);
  const currentCopy = useRef({ payload, components, scope: copyScope, payloadStamp, readOnly, adding, sourceBlockReasons, onChange });
  currentCopy.current = { payload, components, scope: copyScope, payloadStamp, readOnly, adding, sourceBlockReasons, onChange };
  const basketIds = [...new Set(components.map((component) => component.basketId))];
  const catalogs = useQueries({ queries: basketIds.map((basketId) => ({
    queryKey: dataSource.subBasketCatalogKey(basketId), queryFn: () => dataSource.getSubBasketCatalog(basketId)
  })) });
  const activeKeys = components.flatMap(({ id }) => [inHouseCalculationKey(id, "labor"), inHouseCalculationKey(id, "material")]);
  const valid = !explicit || (!parsed.issues.length && activeKeys.every((key) => validity[key] !== false));
  useEffect(() => { onValidationChange(valid); }, [onValidationChange, valid]);
  useEffect(() => { onPendingChange(pending); }, [onPendingChange, pending]);
  useEffect(() => () => onPendingChange({}), [onPendingChange]);
  useEffect(() => { setNotice(""); }, [pendingSaveVersion]);
  useEffect(() => {
    if (adding || !focusAfterAdd.current) return;
    rowRefs.current.get(focusAfterAdd.current)?.focus();
    focusAfterAdd.current = null;
  }, [adding]);
  useEffect(() => {
    if (!focusAfterCopy.current) return;
    rowRefs.current.get(focusAfterCopy.current)?.focus();
    focusAfterCopy.current = null;
  }, [editorEpochs]);
  useEffect(() => {
    if (!validationAttempt) return;
    const invalid = components.find((component, index) => ["labor", "material"].some((cost) => validity[inHouseCalculationKey(component.id, cost as "labor" | "material")] === false)
      || issues.some(({ path }) => path.startsWith(`inHouseComponents.${index}.`)));
    if (invalid) setExpanded((current) => current.includes(invalid.id) ? current : [...current, invalid.id]);
  }, [validationAttempt, validity, issues, components]);

  function update(component: KnowledgeInHouseComponent) {
    onChange(withInHouseComponents(payload, components.map((entry) => entry.id === component.id ? component : entry)));
  }

  function clearDrag() {
    dragRef.current = null;
    dragOrigin.current = null;
    setDragging(false);
    setDropTarget(null);
  }

  function componentLabel(component: KnowledgeInHouseComponent) {
    const catalog = catalogs[basketIds.indexOf(component.basketId)];
    const basketName = baskets.find(({ id }) => id === component.basketId)?.name ?? (item.basketId === component.basketId ? item.basketName : "Unavailable Main basket");
    const groupName = component.subBasketId === null ? "Current In-house configuration"
      : catalog?.data?.items.find(({ id }) => id === component.subBasketId)?.name ?? (catalog?.isPending ? "Loading Sub-basket…" : "Unavailable Sub-basket");
    return `${basketName} / ${groupName}`;
  }

  function validCopySource(snapshot: InHouseCopySource) {
    const current = currentCopy.current;
    const candidate = current.components.find(({ id }) => id === snapshot.sourceId);
    return Boolean(candidate && hasCopyableConfiguration(candidate) && !current.readOnly && !current.adding && !current.sourceBlockReasons[candidate.id]
      && snapshot.scope === current.scope && snapshot.payloadStamp === current.payloadStamp && snapshot.sourceStamp === JSON.stringify(candidate));
  }

  function copyTo(sourceId: string, targetId: string, targetLabel: string, snapshot?: InHouseCopySource) {
    const current = currentCopy.current;
    const origin = current.components.find(({ id }) => id === sourceId);
    if (current.readOnly || current.adding || !origin || !hasCopyableConfiguration(origin) || targetId === sourceId || targetId === LEGACY_IN_HOUSE_COMPONENT_ID) return;
    const reason = current.sourceBlockReasons[sourceId];
    if (reason) { setNotice(reason); return; }
    if (snapshot && !validCopySource(snapshot)) { setNotice("The source configuration changed. Choose the component again before copying."); return; }
    const copied = copyInHouseComponentConfiguration(current.payload, sourceId, targetId);
    if (!copied) { setNotice("This component could not be replaced. Review its configuration and try again."); return; }
    const movingExisting = sourceId === LEGACY_IN_HOUSE_COMPONENT_ID;
    // Replace the destination and remove the old source in one pending Mode update.
    const next = movingExisting
      ? withInHouseComponents(copied, parseInHouseComponents(copied.inHouseComponents).components.filter(({ id }) => id !== sourceId))
      : copied;
    current.onChange(next);
    const resetIds = movingExisting ? [sourceId, targetId] : [targetId];
    const targetKeys = new Set(resetIds.flatMap((id) => [inHouseCalculationKey(id, "labor"), inHouseCalculationKey(id, "material")]));
    setPending((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !targetKeys.has(key))));
    setValidity((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !targetKeys.has(key))));
    const targetScopeKeys = new Set(resetIds.flatMap((id) => [scopePendingKey(id, "inclusions"), scopePendingKey(id, "exclusions")]));
    setScopePending((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !targetScopeKeys.has(key))));
    // A new body clears only this target's raw calculator/checklist text, even
    // when copied values happen to equal the previous serialized settings.
    setEditorEpochs((value) => ({ ...value, [targetId]: (value[targetId] ?? 0) + 1 }));
    setExpanded((ids) => {
      const retained = movingExisting ? ids.filter((id) => id !== sourceId) : ids;
      return retained.includes(targetId) ? retained : [...retained, targetId];
    });
    focusAfterCopy.current = targetId;
    if (copyPicker) copyReturnFocus.current = rowRefs.current.get(targetId) ?? null;
    setCopyPicker(null);
    const originLabel = sourceId === LEGACY_IN_HOUSE_COMPONENT_ID ? "Existing In-house configuration" : componentLabel(origin);
    setNotice(`${originLabel} ${movingExisting ? "moved" : "copied"} to ${targetLabel}. Save Mode to keep this change.`);
    clearDrag();
  }

  function openCopyPicker(sourceId: string, trigger: HTMLElement) {
    const current = currentCopy.current;
    const origin = current.components.find(({ id }) => id === sourceId);
    if (current.readOnly || current.adding || !origin || !hasCopyableConfiguration(origin) || current.sourceBlockReasons[sourceId]) return;
    copyReturnFocus.current = trigger;
    setCopyPicker({ sourceId, scope: current.scope, payloadStamp: current.payloadStamp, sourceStamp: JSON.stringify(origin) });
  }

  function startDrag(event: DragEvent<HTMLElement>, sourceId: string) {
    const current = currentCopy.current;
    const origin = current.components.find(({ id }) => id === sourceId);
    const pointerOrigin = dragOrigin.current;
    const fromHandle = event.target instanceof Element && Boolean(event.target.closest("[data-in-house-drag-handle]"));
    if (interactiveDragOrigin(event.target) || (!fromHandle && pointerOrigin?.sourceId === sourceId && pointerOrigin.scope === current.scope && pointerOrigin.blocked)
      || current.readOnly || current.adding || !origin || !hasCopyableConfiguration(origin) || current.sourceBlockReasons[sourceId]) { event.preventDefault(); return; }
    event.stopPropagation();
    const gesture = { token: crypto.randomUUID(), sourceId, scope: current.scope, payloadStamp: current.payloadStamp, sourceStamp: JSON.stringify(origin) };
    dragRef.current = gesture;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(IN_HOUSE_DRAG_TYPE, gesture.token);
    setDragging(true);
    setDropTarget(null);
  }

  function acceptsDrag(event: DragEvent<HTMLElement>, targetId: string) {
    const current = currentCopy.current;
    const gesture = dragRef.current;
    return Boolean(gesture && validCopySource(gesture) && targetId !== gesture.sourceId && targetId !== LEGACY_IN_HOUSE_COMPONENT_ID
      && Array.from(event.dataTransfer.types).includes(IN_HOUSE_DRAG_TYPE)
      && parseInHouseComponents(current.payload.inHouseComponents).components.some(({ id }) => id === targetId));
  }

  const dropEvents = (targetId: string, targetLabel: string) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!acceptsDrag(event, targetId)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setDropTarget(targetId);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        setDropTarget((current) => current === targetId ? null : current);
      }
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!acceptsDrag(event, targetId)) return;
      event.preventDefault(); event.stopPropagation();
      const gesture = dragRef.current!;
      if (event.dataTransfer.getData(IN_HOUSE_DRAG_TYPE) === gesture.token) copyTo(gesture.sourceId, targetId, targetLabel, gesture);
      clearDrag();
    }
  });

  useEffect(() => {
    const gesture = dragRef.current;
    if (gesture && !validCopySource(gesture)) clearDrag();
    if (copyPicker && !validCopySource(copyPicker)) setCopyPicker(null);
  }, [readOnly, adding, copyScope, payloadStamp, pending, validity, scopePending, copyPicker]);
  useEffect(() => {
    if (!dragging) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") clearDrag(); };
    window.addEventListener("keydown", cancel);
    window.addEventListener("dragend", clearDrag);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("dragend", clearDrag); };
  }, [dragging]);

  async function add(component: KnowledgeInHouseComponent) {
    const legacy = !explicit ? legacyInHouseComponent(payload, item) : null;
    const current = explicit ? components : legacy ? [legacy] : [];
    const next = withInHouseComponents(payload, [...current.filter(({ id }) => id !== component.id), component]);
    setExpanded((ids) => ids.includes(component.id) ? ids : [...ids, component.id]);
    const saved = await onSaveComponent(next);
    if (saved) { focusAfterAdd.current = component.id; setAdding(false); setNotice("In-house component saved."); }
    return saved;
  }

  const validationPublishers = useMemo(() => Object.fromEntries(activeKeys.map((key) => [key, (value: boolean) => setValidity((current) => current[key] === value ? current : { ...current, [key]: value })])), [activeKeys.join("|")]);
  const pendingPublishers = useMemo(() => Object.fromEntries(activeKeys.map((key) => [key, (value: KnowledgePendingCalculation | null) => setPending((current) => JSON.stringify(current[key] ?? null) === JSON.stringify(value) ? current : { ...current, [key]: value })])), [activeKeys.join("|")]);
  const scopeKeys = components.flatMap(({ id }) => [scopePendingKey(id, "inclusions"), scopePendingKey(id, "exclusions")]);
  const scopePublishers = useMemo(() => Object.fromEntries(scopeKeys.map((key) => [key,
    (value: boolean) => setScopePending((current) => current[key] === value ? current : { ...current, [key]: value })])), [scopeKeys.join("|")]);
  const pickerOrigin = copyPicker ? components.find(({ id }) => id === copyPicker.sourceId) : undefined;

  return <div className="knowledge-in-house-components">
    <div className="knowledge-in-house-components__toolbar">
      <p>{readOnly
        ? onRequestDraft ? "Create a Draft revision to add components. The active revision remains read-only." : "In-house configuration is read-only."
        : explicit ? "Each component keeps its own scope, labour and material settings." : "Add components to configure In-house work by Main basket and Sub-basket."}</p>
      {!readOnly || onRequestDraft ? <Button ref={addRef} variant="secondary" size="compact" disabled={components.length >= MAX_IN_HOUSE_COMPONENTS} onClick={() => {
        if (readOnly) onRequestDraft?.();
        else setAdding(true);
      }}>Add component</Button> : null}
    </div>
    {!readOnly && components.length > 0 ? <p id={copyInstructionId} className="knowledge-in-house-components__copy-instructions">Use or drag the existing configuration to move it into a component. Copy configuration duplicates other components. Scope, Labour and Material are replaced together.</p> : null}
    <p className={notice ? "knowledge-in-house-components__notice" : "sr-only"} role="status" aria-live="polite">{notice}</p>
    {explicit && !components.length ? <p>No In-house components configured.</p> : null}
    {parsed.issues.length ? <InlineMessage tone="error">{parsed.issues[0]!.message}</InlineMessage> : null}
    {components.map((component, index) => {
      const catalog = catalogs[basketIds.indexOf(component.basketId)];
      const label = componentLabel(component);
      const preserved = component.id === LEGACY_IN_HOUSE_COMPONENT_ID;
      const editorLabel = preserved ? "Existing In-house configuration" : label;
      const copyBlockReason = sourceBlockReasons[component.id];
      const configured = hasCopyableConfiguration(component);
      const canDrag = configured && !readOnly && !adding && !copyBlockReason;
      const canUseExisting = Boolean(source && hasCopyableConfiguration(source) && !preserved && !readOnly && !adding && !sourceBlockReasons[source.id]);
      const gesture = dragRef.current;
      const eligibleTarget = Boolean(dragging && gesture && validCopySource(gesture) && !preserved && gesture.sourceId !== component.id);
      const open = expanded.includes(component.id);
      const panelId = `in-house-component-${encodeURIComponent(item.mainLineId)}-${encodeURIComponent(component.id)}`;
      return <section key={component.id} className="knowledge-in-house-components__component" aria-label={editorLabel}
        draggable={canDrag} aria-describedby={canDrag ? copyInstructionId : undefined}
        onPointerDownCapture={(event) => { dragOrigin.current = { sourceId: component.id, scope: copyScope, blocked: interactiveDragOrigin(event.target) }; }}
        onMouseDownCapture={(event) => { dragOrigin.current = { sourceId: component.id, scope: copyScope, blocked: interactiveDragOrigin(event.target) }; }}
        onDragStart={(event) => startDrag(event, component.id)} onDragEnd={clearDrag}
        data-preserved={preserved || undefined} data-drop-eligible={eligibleTarget || undefined} data-drop-active={eligibleTarget && dropTarget === component.id || undefined}
        {...(!preserved ? dropEvents(component.id, label) : {})}>
        <div className="knowledge-in-house-components__heading">
          <h5><button ref={(node) => { if (node) rowRefs.current.set(component.id, node); else rowRefs.current.delete(component.id); }} type="button" aria-expanded={open} aria-controls={panelId}
            data-in-house-drag-handle={canDrag || undefined} draggable={canDrag}
            aria-label={preserved ? "Existing In-house configuration" : undefined}
            onClick={() => setExpanded((current) => open ? current.filter((id) => id !== component.id) : [...current, component.id])}>
            <span className={preserved ? "knowledge-in-house-components__source-name" : undefined}>{preserved ? <><strong>Existing In-house configuration</strong><small>{label}</small></> : label}</span><span className="knowledge-in-house-components__disclosure" aria-hidden="true">{open ? "−" : "+"}</span>
          </button></h5>
          {!readOnly ? <div className="knowledge-in-house-components__actions">
            {preserved || configured ? <Button variant="secondary" size="compact" className="knowledge-in-house-components__drag" disabled={!canDrag}
              data-in-house-drag-handle draggable={canDrag} aria-describedby={copyInstructionId} aria-haspopup="dialog"
              onClick={(event) => openCopyPicker(component.id, event.currentTarget)}>{preserved ? "Drag existing configuration" : "Copy configuration"}</Button> : null}
            {!preserved && source ? <Button variant="secondary" size="compact" disabled={!canUseExisting} aria-describedby={copyInstructionId}
                onClick={() => copyTo(source.id, component.id, label)}>Use existing configuration</Button> : null}
            <Button variant="quiet" size="compact" aria-label={preserved ? "Remove existing configuration" : `Remove component ${label}`} onClick={() => {
              onChange(withInHouseComponents(payload, components.filter(({ id }) => id !== component.id)));
              setPending((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${component.id}:`))));
              setValidity((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${component.id}:`))));
              setScopePending((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${component.id}:`))));
              setExpanded((current) => current.filter((id) => id !== component.id));
              clearDrag();
              if (preserved) setNotice("Existing In-house configuration removed. Component values are unchanged. Save Mode to keep this change.");
              addRef.current?.focus();
            }}>{preserved ? "Remove existing configuration" : "Remove"}</Button>
          </div> : null}
        </div>
        {preserved ? <div className="knowledge-in-house-components__source-summary">
          <div className="knowledge-in-house-components__cost-summary">{(["labor", "material"] as const).map((cost) => {
            const name = cost === "labor" ? "Labour" : "Material";
            const rate = component[cost]?.baseRatePaise;
            return <span key={cost}>{component[cost] === null ? `${name} not configured` : typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0
              ? <>{name} base rate <strong>{formatKnowledgeMoney(rate)}</strong></> : `${name} needs review`}</span>;
          })}</div>
          <p>Using or dragging this configuration moves it into the selected component and removes this original section.</p>
          {!readOnly && copyBlockReason ? <p className="knowledge-in-house-components__copy-blocked">{copyBlockReason}</p> : null}
        </div> : null}
        {!preserved && !readOnly && copyBlockReason ? <p className="knowledge-in-house-components__copy-blocked">{copyBlockReason}</p> : null}
        {dragging && eligibleTarget && dropTarget === component.id ? <p className="knowledge-in-house-components__drop-hint">Drop to replace this component’s scope and costs.</p> : null}
        <div key={`${component.id}:${editorEpochs[component.id] ?? 0}`} id={panelId} hidden={!open} className="knowledge-in-house-components__body">
          {catalog?.isError ? <InlineMessage tone="warning">The Sub-basket name could not be loaded. <Button variant="quiet" onClick={() => void catalog.refetch()}>Retry Sub-basket</Button></InlineMessage> : null}
          <div className="knowledge-pmc-scope knowledge-in-house-scope">{(["inclusions", "exclusions"] as const).map((list) => <KnowledgePmcScopeChecklist key={list} list={list}
            contextLabel={editorLabel} items={component[list]} oppositeItems={component[list === "inclusions" ? "exclusions" : "inclusions"]} readOnly={readOnly}
            onPendingChange={scopePublishers[scopePendingKey(component.id, list)]}
            onChange={(entries) => update({ ...component, [list]: entries })} />)}</div>
          {(["labor", "material"] as const).map((cost) => <KnowledgeModeCalculationEditor key={cost} scope={cost === "labor" ? "in_house_labor" : "in_house_material"}
            contextLabel={`${editorLabel} · ${cost === "labor" ? "Labor cost" : "Material cost"}`} active={open}
            issuePath={`inHouseComponents.${index}.${cost}`} value={component[cost] as unknown as KnowledgeJsonValue}
            uom={{ ...uom, scopeKey: `${uom.scopeKey}:${component.id}:${cost}` }} readOnly={readOnly} validationAttempt={validationAttempt} issues={issues}
            onChange={(settings) => update({ ...component, [cost]: settings })} onDirty={() => onChange(payload)}
            onValidationChange={validationPublishers[inHouseCalculationKey(component.id, cost)]!}
            onPendingInputChange={pendingPublishers[inHouseCalculationKey(component.id, cost)]!} pendingSaveVersion={pendingSaveVersion} emptyDefaults={emptyCalculationDefaults} />)}
          <KnowledgeInHouseTotal active={open} labor={component.labor as unknown as KnowledgeJsonValue} material={component.material as unknown as KnowledgeJsonValue}
            valid={["labor", "material"].every((cost) => validity[inHouseCalculationKey(component.id, cost as "labor" | "material")] !== false)} uom={{ ...uom, scopeKey: `${uom.scopeKey}:${component.id}` }} />
        </div>
      </section>;
    })}
    {copyPicker && pickerOrigin ? <ContextPanel title={copyPicker.sourceId === LEGACY_IN_HOUSE_COMPONENT_ID ? "Move In-house configuration" : "Copy In-house configuration"}
      eyebrow={copyPicker.sourceId === LEGACY_IN_HOUSE_COMPONENT_ID ? "Existing In-house configuration" : componentLabel(pickerOrigin)}
      description={copyPicker.sourceId === LEGACY_IN_HOUSE_COMPONENT_ID
        ? "Choose the component to receive this scope, Labour and Material. The original section is removed. Save Mode to keep the change."
        : "Choose the component whose scope, Labour and Material should be replaced. The source is retained. Save Mode to keep the change."}
      onClose={() => setCopyPicker(null)} returnFocusRef={copyReturnFocus} width="medium" className="knowledge-context-panel"
      footer={({ requestClose }) => <div className="knowledge-dialog-actions"><Button variant="secondary" onClick={requestClose}>Close</Button></div>}>
      <div className="knowledge-dialog-body knowledge-in-house-components__destinations">
        {components.filter(({ id }) => id !== copyPicker.sourceId && id !== LEGACY_IN_HOUSE_COMPONENT_ID).map((target) => <Button key={target.id} variant="secondary"
          disabled={!validCopySource(copyPicker)} onClick={() => copyTo(copyPicker.sourceId, target.id, componentLabel(target), copyPicker)}>Replace {componentLabel(target)}</Button>)}
        {!components.some(({ id }) => id !== copyPicker.sourceId && id !== LEGACY_IN_HOUSE_COMPONENT_ID) ? <p>Add another component to choose a destination.</p> : null}
      </div>
    </ContextPanel> : null}
    {adding ? <AddInHouseComponent item={item} baskets={baskets} existing={components} payload={payload} dataSource={dataSource} readOnly={readOnly}
      onClose={() => setAdding(false)} onAdd={add} returnFocusRef={addRef} /> : null}
  </div>;
}

function AddInHouseComponent({ item, baskets, existing, payload, dataSource, readOnly, onClose, onAdd, returnFocusRef }: {
  item: KnowledgeItemDetail; baskets: readonly KnowledgeBasket[]; existing: readonly KnowledgeInHouseComponent[]; payload: KnowledgeJsonObject;
  dataSource: KnowledgeEditorDataSource; readOnly: boolean; onClose: () => void; onAdd: (component: KnowledgeInHouseComponent) => Promise<boolean>;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const auth = useAuth();
  const id = useId();
  const [basketId, setBasketId] = useState(item.basketId);
  const [subBasketId, setSubBasketId] = useState("");
  const [candidate, setCandidate] = useState<KnowledgeInHouseComponent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState("");
  const lock = useRef(false);
  const catalog = useQuery({ queryKey: dataSource.subBasketCatalogKey(basketId), queryFn: () => dataSource.getSubBasketCatalog(basketId), enabled: Boolean(basketId) });
  const choices = baskets.filter((basket) => basket.status === "active");
  const basket = choices.find(({ id: value }) => value === basketId);
  const legacy = Object.hasOwn(payload, "inHouseComponents") ? null : legacyInHouseComponent(payload, item);
  const targets = legacy ? [...existing, legacy] : existing;
  const duplicate = targets.some((component) => component.id !== candidate?.id && component.basketId === basketId && component.subBasketId === subBasketId);
  const selected = catalog.data?.items.find(({ id: value, basketId: parent }) => value === subBasketId && parent === basketId);
  const canSave = Boolean(basket && selected && !duplicate && !catalog.isFetching && !catalog.isError && !readOnly && !saving);
  const canRequest = (dataSource.scopeKey === "live-configuration" || dataSource.supportsLiveConfigurationRequests === true) && auth.user?.role === "super_admin"
    && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");

  async function save() {
    if (!canSave || lock.current) return;
    lock.current = true; setSaving(true); setError("");
    const value = candidate ?? { id: crypto.randomUUID(), basketId, subBasketId, inclusions: [], exclusions: [], labor: null, material: null };
    setCandidate(value);
    try {
      if (!await onAdd(value)) setError("The component could not be saved. Resolve any highlighted Mode fields or conflict, then retry saving.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The component could not be saved."); }
    finally { lock.current = false; setSaving(false); }
  }

  return <><ContextPanel title="Add In-house component" eyebrow={item.mainLineName} description="Select a Main basket and Sub-basket. Saving also saves valid pending Mode changes."
    width="medium" busy={saving} onClose={onClose} returnFocusRef={returnFocusRef} className="knowledge-context-panel"
    footer={({ requestClose }) => <div className="knowledge-dialog-actions"><Button variant="secondary" disabled={saving} onClick={requestClose}>Close</Button><Button busy={saving} disabled={!canSave} onClick={() => void save()}>{candidate ? "Retry save" : "Save component"}</Button></div>}>
    <div className="knowledge-dialog-body">
      <Field id={`${id}-basket`} label="Main basket" required>{(props) => <Select {...props} value={basketId} disabled={saving || Boolean(candidate)} onChange={(event) => { setBasketId(event.target.value); setSubBasketId(""); setRequested(""); }}>
        <option value="">Select a Main basket</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
      </Select>}</Field>
      <Field id={`${id}-sub`} label="Sub-basket" required error={duplicate ? "This Sub-basket is already a component." : undefined}>{(props) => <Select {...props} value={subBasketId} disabled={!basketId || catalog.isPending || catalog.isError || saving || Boolean(candidate)} onChange={(event) => setSubBasketId(event.target.value)}>
        <option value="">Select a Sub-basket</option>{catalog.data?.items.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </Select>}</Field>
      {catalog.isPending ? <p role="status">Loading Sub-baskets…</p> : null}
      {catalog.isError ? <InlineMessage tone="error">Sub-baskets could not be loaded. <Button variant="quiet" onClick={() => void catalog.refetch()}>Retry Sub-baskets</Button></InlineMessage> : null}
      {catalog.isSuccess && !catalog.data.items.length ? <p>No Sub-baskets available under this Main basket.</p> : null}
      {canRequest && basket && !candidate ? <Button variant="quiet" disabled={saving} onClick={() => setRequesting(true)}>Request a missing Sub-basket</Button> : null}
      {requested ? <InlineMessage tone="info">{requested} <Button variant="quiet" onClick={() => void catalog.refetch()}>Refresh Sub-baskets</Button></InlineMessage> : null}
      {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    </div>
  </ContextPanel>{requesting && basket ? <KnowledgeSubBasketRequestPanel basketId={basket.id} basketName={basket.name} onClose={() => setRequesting(false)} onRequested={(request) => {
        setRequested(request.status === "fulfilled" ? "The Sub-basket request is approved. Refresh the list to select it." : request.status === "rejected" ? "The Sub-basket request was rejected. Review its decision before submitting another request." : "Sub-basket request submitted for approval. It becomes selectable after approval.");
        if (request.status === "fulfilled") void catalog.refetch();
        setRequesting(false);
      }} /> : null}</>;
}
