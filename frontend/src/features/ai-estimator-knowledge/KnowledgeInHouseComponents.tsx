import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  legacyInHouseComponent, MAX_IN_HOUSE_COMPONENTS, parseInHouseComponents,
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
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";
import "./knowledge-in-house-components.css";

export type InHousePendingCalculations = Readonly<Record<string, KnowledgePendingCalculation | null>>;
export const inHouseCalculationKey = (id: string, cost: "labor" | "material") => `${id}:${cost}`;

export function KnowledgeInHouseComponents({ payload, item, baskets, dataSource, uom, readOnly, validationAttempt, pendingSaveVersion, issues, onChange, onSaveComponent, onValidationChange, onPendingChange, onRequestDraft }: {
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
  const [expanded, setExpanded] = useState<string[]>([]);
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, KnowledgePendingCalculation | null>>({});
  const [notice, setNotice] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterAdd = useRef<string | null>(null);
  const basketIds = [...new Set(components.map((component) => component.basketId))];
  const catalogs = useQueries({ queries: basketIds.map((basketId) => ({
    queryKey: dataSource.subBasketCatalogKey(basketId), queryFn: () => dataSource.getSubBasketCatalog(basketId)
  })) });
  const activeKeys = components.flatMap(({ id }) => [inHouseCalculationKey(id, "labor"), inHouseCalculationKey(id, "material")]);
  const valid = !explicit || (!parsed.issues.length && activeKeys.every((key) => validity[key] !== false));
  useEffect(() => { onValidationChange(valid); }, [onValidationChange, valid]);
  useEffect(() => { onPendingChange(pending); }, [onPendingChange, pending]);
  useEffect(() => () => onPendingChange({}), [onPendingChange]);
  useEffect(() => {
    if (adding || !focusAfterAdd.current) return;
    rowRefs.current.get(focusAfterAdd.current)?.focus();
    focusAfterAdd.current = null;
  }, [adding]);
  useEffect(() => {
    if (!validationAttempt) return;
    const invalid = components.find((component, index) => ["labor", "material"].some((cost) => validity[inHouseCalculationKey(component.id, cost as "labor" | "material")] === false)
      || issues.some(({ path }) => path.startsWith(`inHouseComponents.${index}.`)));
    if (invalid) setExpanded((current) => current.includes(invalid.id) ? current : [...current, invalid.id]);
  }, [validationAttempt, validity, issues, components]);

  function update(component: KnowledgeInHouseComponent) {
    onChange(withInHouseComponents(payload, components.map((entry) => entry.id === component.id ? component : entry)));
  }

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
    <span className="sr-only" aria-live="polite">{notice}</span>
    {explicit && !components.length ? <p>No In-house components configured.</p> : null}
    {parsed.issues.length ? <InlineMessage tone="error">{parsed.issues[0]!.message}</InlineMessage> : null}
    {components.map((component, index) => {
      const catalog = catalogs[basketIds.indexOf(component.basketId)];
      const basketName = baskets.find(({ id }) => id === component.basketId)?.name ?? (item.basketId === component.basketId ? item.basketName : "Unavailable Main basket");
      const groupName = component.subBasketId === null ? "Current In-house configuration"
        : catalog?.data?.items.find(({ id }) => id === component.subBasketId)?.name ?? (catalog?.isPending ? "Loading Sub-basket…" : "Unavailable Sub-basket");
      const label = `${basketName} / ${groupName}`;
      const open = expanded.includes(component.id);
      const panelId = `in-house-component-${encodeURIComponent(item.mainLineId)}-${encodeURIComponent(component.id)}`;
      return <section key={component.id} className="knowledge-in-house-components__component" aria-label={label}>
        <div className="knowledge-in-house-components__heading">
          <h5><button ref={(node) => { if (node) rowRefs.current.set(component.id, node); else rowRefs.current.delete(component.id); }} type="button" aria-expanded={open} aria-controls={panelId}
            onClick={() => setExpanded((current) => open ? current.filter((id) => id !== component.id) : [...current, component.id])}>
            <span>{label}</span><span className="knowledge-in-house-components__disclosure" aria-hidden="true">{open ? "−" : "+"}</span>
          </button></h5>
          {!readOnly ? <Button variant="quiet" size="compact" aria-label={`Remove component ${label}`} onClick={() => {
            onChange(withInHouseComponents(payload, components.filter(({ id }) => id !== component.id)));
            setPending((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${component.id}:`))));
            addRef.current?.focus();
          }}>Remove</Button> : null}
        </div>
        <div id={panelId} hidden={!open} className="knowledge-in-house-components__body">
          {catalog?.isError ? <InlineMessage tone="warning">The Sub-basket name could not be loaded. <Button variant="quiet" onClick={() => void catalog.refetch()}>Retry Sub-basket</Button></InlineMessage> : null}
          <div className="knowledge-pmc-scope knowledge-in-house-scope">{(["inclusions", "exclusions"] as const).map((list) => <KnowledgePmcScopeChecklist key={list} list={list}
            contextLabel={label} items={component[list]} oppositeItems={component[list === "inclusions" ? "exclusions" : "inclusions"]} readOnly={readOnly}
            onChange={(entries) => update({ ...component, [list]: entries })} />)}</div>
          {(["labor", "material"] as const).map((cost) => <KnowledgeModeCalculationEditor key={cost} scope={cost === "labor" ? "in_house_labor" : "in_house_material"}
            contextLabel={`${label} · ${cost === "labor" ? "Labor cost" : "Material cost"}`} active={open}
            issuePath={`inHouseComponents.${index}.${cost}`} value={component[cost] as unknown as KnowledgeJsonValue}
            uom={{ ...uom, scopeKey: `${uom.scopeKey}:${component.id}:${cost}` }} readOnly={readOnly} validationAttempt={validationAttempt} issues={issues}
            onChange={(settings) => update({ ...component, [cost]: settings })} onDirty={() => onChange(payload)}
            onValidationChange={validationPublishers[inHouseCalculationKey(component.id, cost)]!}
            onPendingInputChange={pendingPublishers[inHouseCalculationKey(component.id, cost)]!} pendingSaveVersion={pendingSaveVersion} emptyDefaults />)}
          <KnowledgeInHouseTotal active={open} labor={component.labor as unknown as KnowledgeJsonValue} material={component.material as unknown as KnowledgeJsonValue}
            valid={["labor", "material"].every((cost) => validity[inHouseCalculationKey(component.id, cost as "labor" | "material")] !== false)} uom={{ ...uom, scopeKey: `${uom.scopeKey}:${component.id}` }} />
        </div>
      </section>;
    })}
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
  const canRequest = dataSource.scopeKey === "live-configuration" && auth.user?.role === "super_admin"
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
