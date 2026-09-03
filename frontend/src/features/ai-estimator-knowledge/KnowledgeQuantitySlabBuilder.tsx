import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import {
  formatKnowledgeMoney,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise,
  type RupeeInputParseResult
} from "./knowledgePresentation";
import {
  estimateSlabCostPaise,
  objectSlabRates
} from "./knowledgeSlabRate";
import {
  parseKnowledgeSpecifications,
  type KnowledgeSpecificationConfiguration
} from "./knowledgeSpecificationConfiguration";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster
} from "./knowledgeTypes";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";

export interface KnowledgeUomCatalogState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly refreshErrorMessage?: string;
  readonly onRetry?: () => void;
}

export interface KnowledgeQuantitySlabBuilderProps {
  readonly value: KnowledgeJsonValue | undefined;
  readonly specifications: KnowledgeJsonValue | undefined;
  readonly uoms: readonly KnowledgeMaster[];
  readonly uomCatalogState?: KnowledgeUomCatalogState;
  readonly issues?: readonly KnowledgeValidationIssue[];
  readonly readOnly: boolean;
  readonly onChange: (value: readonly KnowledgeJsonValue[]) => void;
  readonly onDirty: () => void;
}

interface SlabRow {
  readonly id: string;
  readonly value: KnowledgeJsonObject;
}

let fallbackSlabRateIdCounter = 0;

export function KnowledgeQuantitySlabBuilder({
  value,
  specifications,
  uoms,
  uomCatalogState = { status: "ready" },
  issues = [],
  readOnly,
  onChange,
  onDirty
}: KnowledgeQuantitySlabBuilderProps) {
  const rows = useMemo<readonly SlabRow[]>(() => objectSlabRates(value).map(
    (entry, index) => ({ id: stringValue(entry.id) || `slab-rate-row-${index}`, value: entry })
  ), [value]);
  const specificationOptions = useMemo(
    () => selectableSpecifications(specifications),
    [specifications]
  );
  const activeUoms = useMemo(
    () => uoms.filter(({ status }) => status === "active"),
    [uoms]
  );
  const catalogUnavailable = uomCatalogState.status !== "ready";

  function update(next: readonly KnowledgeJsonValue[]) {
    onDirty();
    onChange(next);
  }

  function replace(index: number, next: KnowledgeJsonObject) {
    update(rows.map((row, rowIndex) => rowIndex === index ? next : row.value));
  }

  const catalogMessage = uomCatalogState.status === "loading"
    ? <InlineMessage tone="info" role="status">Loading the complete Unit of measure list…</InlineMessage>
    : uomCatalogState.status === "error"
      ? (
          <InlineMessage
            tone="error"
            role="alert"
            title="Units could not be loaded"
            action={uomCatalogState.onRetry ? <Button size="compact" variant="secondary" onClick={uomCatalogState.onRetry}>Retry Units</Button> : undefined}
          >
            {uomCatalogState.errorMessage ?? "Retry before selecting or changing a Unit."}
          </InlineMessage>
        )
      : uomCatalogState.refreshErrorMessage
        ? (
            <InlineMessage
              tone="warning"
              title="Units may be out of date"
              action={uomCatalogState.onRetry ? <Button size="compact" variant="secondary" onClick={uomCatalogState.onRetry}>Retry Units</Button> : undefined}
            >
              Saved Unit choices remain available. {uomCatalogState.refreshErrorMessage}
            </InlineMessage>
          )
        : uomCatalogState.refreshing
          ? <InlineMessage tone="info" role="status">Refreshing Units; saved choices remain available.</InlineMessage>
          : null;

  const emptyMessage = specificationOptions.length === 0
    ? "Add a Specification in Budgeting to complete a Quantity slab."
    : uomCatalogState.status === "loading"
      ? "Units are loading. You can add a slab now and select its Unit when ready."
      : uomCatalogState.status === "error"
        ? "Retry Units before selecting a Unit for the slab."
        : activeUoms.length === 0
          ? "Add a Unit to complete a Quantity slab."
          : "No quantity slabs configured.";

  return (
    <div className="knowledge-quantity-slabs">
      <p className="knowledge-help-text">
        Estimate one Specification and Unit quantity at a per-unit rate. Estimated cost excludes tax, wastage, margins, and markup.
      </p>
      {catalogMessage}
      <KnowledgeRepeater
        label="Quantity slabs"
        addLabel="Add Quantity slab"
        items={rows}
        disabled={readOnly}
        readOnly={readOnly}
        emptyMessage={emptyMessage}
        itemLabel={(_row, index) => `slab ${index + 1}`}
        onAdd={() => update([...rows.map(({ value: row }) => row), createSlabRate()])}
        onRemove={(id) => update(rows.filter((row) => row.id !== id).map((row) => row.value))}
        onMove={(id, direction) => {
          const next = [...rows];
          const from = next.findIndex((row) => row.id === id);
          const to = direction === "up" ? from - 1 : from + 1;
          if (from < 0 || to < 0 || to >= next.length) return;
          [next[from], next[to]] = [next[to]!, next[from]!];
          update(next.map((row) => row.value));
        }}
        renderItem={(row, index) => (
          <SlabRateRow
            index={index}
            value={row.value}
            specifications={specificationOptions}
            uoms={uoms}
            catalogUnavailable={catalogUnavailable}
            issues={issues}
            readOnly={readOnly}
            onChange={(next) => replace(index, next)}
          />
        )}
      />
    </div>
  );
}

function SlabRateRow({
  index,
  value,
  specifications,
  uoms,
  catalogUnavailable,
  issues,
  readOnly,
  onChange
}: {
  readonly index: number;
  readonly value: KnowledgeJsonObject;
  readonly specifications: readonly KnowledgeSpecificationConfiguration[];
  readonly uoms: readonly KnowledgeMaster[];
  readonly catalogUnavailable: boolean;
  readonly issues: readonly KnowledgeValidationIssue[];
  readonly readOnly: boolean;
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const rowPath = `slabRates.${index}`;
  const prefix = domId(stringValue(value.id) || `row-${index}`);
  const specificationId = stringValue(value.specificationId);
  const uomId = stringValue(value.uomId);
  const quantity = stringValue(value.quantity);
  const unitRatePaise = numberValue(value.unitRatePaise);
  const selectedUom = uoms.find(({ id }) => id === uomId);
  const scale = selectedUom?.decimalScale;
  const estimatedCostPaise = estimateSlabCostPaise(quantity, unitRatePaise, scale);
  const formattedEstimate = estimatedCostPaise === null
    ? "—"
    : formatKnowledgeMoney(estimatedCostPaise);
  const [announceEstimate, setAnnounceEstimate] = useState(false);
  const issueFor = (field: string) => issues.find(({ path }) => path === `${rowPath}.${field}`)?.message;
  const set = (field: string, next: KnowledgeJsonValue | undefined) => {
    setAnnounceEstimate(false);
    onChange(setObjectValue(value, field, next));
  };
  const specificationMissing = Boolean(specificationId)
    && !specifications.some(({ id }) => id === specificationId);
  const selectedUomUnavailable = Boolean(selectedUom && selectedUom.status !== "active");
  const uomMissing = Boolean(uomId) && !selectedUom;
  const activeUoms = uoms.filter(({ status }) => status === "active");

  return (
    <fieldset className="knowledge-slab-rate" aria-describedby={`${prefix}-estimate-help`}>
      <legend>Quantity slab {index + 1}</legend>
      <div className="knowledge-slab-rate__grid">
        <Field
          id={`${prefix}-specification`}
          label="Specification"
          required
          error={issueFor("specificationId")}
          hint={specifications.length === 0 ? "Add a Specification in Budgeting first." : undefined}
        >
          {(props) => (
            <Select
              {...props}
              disabled={readOnly || specifications.length === 0}
              value={specificationId}
              onChange={(event) => set("specificationId", event.target.value || undefined)}
            >
              <option value="">{specifications.length === 0 ? "Add a Specification in Budgeting first" : "Select a Specification"}</option>
              {specificationMissing ? <option value={specificationId} disabled>Unavailable saved Specification</option> : null}
              {specifications.map((specification) => <option key={specification.id} value={specification.id}>{specification.name}</option>)}
            </Select>
          )}
        </Field>
        <Field
          id={`${prefix}-uom`}
          label="Unit of measure"
          required
          error={issueFor("uomId")}
          hint={activeUoms.length === 0 && !catalogUnavailable ? "Add a Unit first." : undefined}
        >
          {(props) => (
            <Select
              {...props}
              disabled={readOnly || catalogUnavailable || activeUoms.length === 0}
              value={uomId}
              onChange={(event) => set("uomId", event.target.value || undefined)}
            >
              <option value="">{catalogUnavailable ? "Units unavailable" : activeUoms.length === 0 ? "Add a Unit first" : "Select a Unit"}</option>
              {uomMissing ? <option value={uomId} disabled>Unavailable saved Unit</option> : null}
              {selectedUomUnavailable ? <option value={selectedUom!.id} disabled>{uomLabel(selectedUom!)} · unavailable</option> : null}
              {activeUoms.map((uom) => <option key={uom.id} value={uom.id}>{uomLabel(uom)}</option>)}
            </Select>
          )}
        </Field>
        <Field
          id={`${prefix}-quantity`}
          label="Quantity"
          required
          error={issueFor("quantity")}
          hint={selectedUom && typeof selectedUom.decimalScale === "number"
            ? `Use up to ${selectedUom.decimalScale} decimal place${selectedUom.decimalScale === 1 ? "" : "s"}.`
            : "Select a Unit before entering Quantity."}
        >
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              maxLength={64}
              disabled={readOnly || catalogUnavailable || !uomId || selectedUomUnavailable || uomMissing}
              value={quantity}
              onChange={(event) => set("quantity", event.target.value || undefined)}
              onBlur={() => setAnnounceEstimate(true)}
            />
          )}
        </Field>
        <SlabRateInput
          id={`${prefix}-unit-rate`}
          valuePaise={unitRatePaise}
          disabled={readOnly}
          error={issueFor("unitRatePaise")}
          onBlur={() => setAnnounceEstimate(true)}
          onChange={(next) => set("unitRatePaise", next)}
        />
        <div className="knowledge-slab-rate__estimate">
          <span>Estimated cost</span>
          <output aria-label={`Estimated cost: ${formattedEstimate}`} aria-live={announceEstimate ? "polite" : "off"}>
            {formattedEstimate}
          </output>
          <p id={`${prefix}-estimate-help`}>Before tax, wastage, margins, and markup.</p>
        </div>
      </div>
    </fieldset>
  );
}

function SlabRateInput({
  id,
  valuePaise,
  disabled,
  error,
  onBlur,
  onChange
}: {
  readonly id: string;
  readonly valuePaise: number | undefined;
  readonly disabled: boolean;
  readonly error?: string;
  readonly onBlur: () => void;
  readonly onChange: (value: number | undefined) => void;
}) {
  const initialText = editableRupeeText(valuePaise);
  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  const parsed = parseRupeeInputToPaise(text);

  function setEditableText(next: string) {
    textRef.current = next;
    setText(next);
  }

  useEffect(() => {
    const current = parseRupeeInputToPaise(textRef.current);
    if (valuePaise === undefined) {
      if (current.status === "valid") setEditableText("");
      return;
    }
    const next = editableRupeeText(valuePaise);
    if (current.status !== "valid" || current.paise !== valuePaise) setEditableText(next);
  }, [valuePaise]);

  const localError = text === "" ? undefined : rupeeInputError(parsed);
  return (
    <Field
      id={id}
      label="Unit rate (₹)"
      required
      hint="Enter a non-negative rupee amount with up to two decimal places."
      error={localError ?? error}
    >
      {(props) => (
        <Input
          {...props}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={64}
          disabled={disabled}
          value={text}
          onChange={(event) => {
            const nextText = event.target.value;
            setEditableText(nextText);
            const next = parseRupeeInputToPaise(nextText);
            onChange(next.status === "valid" ? next.paise : undefined);
          }}
          onBlur={() => {
            const current = parseRupeeInputToPaise(textRef.current);
            if (current.status === "valid") {
              setEditableText(formatPaiseForRupeeInput(current.paise));
            }
            onBlur();
          }}
        />
      )}
    </Field>
  );
}

function selectableSpecifications(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeSpecificationConfiguration[] {
  const parsed = parseKnowledgeSpecifications(value);
  const invalidNameIndices = new Set(parsed.issues.flatMap(({ path }) => {
    const match = /^specifications\.(\d+)\.name$/u.exec(path);
    return match ? [Number(match[1])] : [];
  }));
  return parsed.specifications.filter((specification, index) =>
    specification.id.trim() && specification.name.trim() && !invalidNameIndices.has(index)
  );
}

function createSlabRate(): KnowledgeJsonObject {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return { id: `knowledge-slabRates-${random}` };
  fallbackSlabRateIdCounter += 1;
  return {
    id: `knowledge-slabRates-${Date.now().toString(36)}-${fallbackSlabRateIdCounter}`
  };
}

function setObjectValue(
  value: KnowledgeJsonObject,
  key: string,
  next: KnowledgeJsonValue | undefined
): KnowledgeJsonObject {
  const copy = { ...value } as Record<string, KnowledgeJsonValue>;
  if (next === undefined || next === "") delete copy[key];
  else copy[key] = next;
  return copy;
}

function rupeeInputError(parsed: RupeeInputParseResult): string | undefined {
  if (parsed.status === "valid") return undefined;
  if (parsed.status === "incomplete") return "Complete the rupee amount with one or two decimal places.";
  return parsed.reason === "unsafe"
    ? "Enter a smaller rupee amount."
    : "Enter a non-negative rupee amount with up to two decimal places.";
}

function editableRupeeText(valuePaise: number | undefined): string {
  return typeof valuePaise === "number" && Number.isSafeInteger(valuePaise) && valuePaise >= 0
    ? formatPaiseForRupeeInput(valuePaise)
    : "";
}

function uomLabel(uom: KnowledgeMaster): string {
  return uom.code ? `${uom.name} · ${uom.code}` : uom.name;
}

function domId(value: string): string {
  return `knowledge-slab-rate-${value.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: KnowledgeJsonValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}
