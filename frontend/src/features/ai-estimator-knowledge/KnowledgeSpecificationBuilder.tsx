import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import {
  KNOWLEDGE_MAX_BRANDS,
  KNOWLEDGE_MAX_SPECIFICATIONS,
  createKnowledgeSpecification,
  parseKnowledgeSpecifications,
  referencedSpecificationIds as referencedSpecificationIdsFromPrices,
  serializeKnowledgeSpecifications,
  validateKnowledgeBrands,
  withSpecificationBrandIds,
  type KnowledgeSpecificationConfiguration,
  type KnowledgeSpecificationIssue
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonValue } from "./knowledgeTypes";
import { KnowledgeBrandMultiSelect } from "./KnowledgeBrandMultiSelect";
import { KnowledgeSpecificationItemNamePicker } from "./KnowledgeSpecificationItemNamePicker";
import type { KnowledgeSpecificationItemNameLookup } from "./knowledgeEditorDataSource";

const MAX_BRAND_NAME_LENGTH = 240;

type SpecificationField = "name" | "brand" | "description";
type SpecificationEditorIntent = "add" | "edit" | "view";

export interface KnowledgeSpecificationChange {
  readonly specifications: readonly KnowledgeJsonValue[];
  readonly brands: readonly KnowledgeJsonValue[];
}

export interface KnowledgeSpecificationBuilderProps {
  readonly itemNameLookup?: KnowledgeSpecificationItemNameLookup;
  readonly value: KnowledgeJsonValue | undefined;
  readonly brands?: KnowledgeJsonValue;
  readonly savedValue?: KnowledgeJsonValue;
  readonly savedBrands?: KnowledgeJsonValue;
  readonly validationAttempt?: number;
  readonly priceEntries: KnowledgeJsonValue | undefined;
  readonly referencedSpecificationIds?: readonly string[];
  readonly slabReferencedSpecificationIds?: readonly string[];
  readonly readOnly: boolean;
  readonly issues?: readonly KnowledgeSpecificationIssue[];
  readonly onChange: (value: KnowledgeSpecificationChange) => void;
  readonly onDirty: () => void;
}

export function KnowledgeSpecificationBuilder({
  itemNameLookup,
  value,
  brands,
  savedValue,
  savedBrands,
  validationAttempt = 0,
  priceEntries,
  referencedSpecificationIds = [],
  slabReferencedSpecificationIds = [],
  readOnly,
  issues: suppliedIssues,
  onChange,
  onDirty
}: KnowledgeSpecificationBuilderProps) {
  const [editingSpecificationId, setEditingSpecificationId] = useState<string | null>(null);
  const [editorIntent, setEditorIntent] = useState<SpecificationEditorIntent>("edit");
  const [brandDialogSpecificationId, setBrandDialogSpecificationId] = useState<string | null>(null);
  const [brandDialogBrandId, setBrandDialogBrandId] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandNameError, setBrandNameError] = useState<string | undefined>();
  const [requestedFocus, setRequestedFocus] = useState<{
    readonly attempt: number;
    readonly specificationId: string;
    readonly field: SpecificationField;
  } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const panelReturnFocusRef = useRef<HTMLElement | null>(null);
  const panelInitialFocusRef = useRef<HTMLElement | null>(null);
  const brandNameRef = useRef<HTMLInputElement>(null);
  const brandSelectRef = useRef<HTMLElement | null>(null);
  const lastValidationAttempt = useRef(0);
  const parsed = useMemo(
    () => parseKnowledgeSpecifications(value, brands ?? []),
    [brands, value]
  );
  const savedParsed = useMemo(
    () => parseKnowledgeSpecifications(savedValue, savedBrands ?? []),
    [savedBrands, savedValue]
  );
  const brandValues = useMemo<readonly KnowledgeJsonValue[]>(
    () => Array.isArray(brands) ? brands : [],
    [brands]
  );
  const savedBrandValues = useMemo<readonly KnowledgeJsonValue[]>(
    () => Array.isArray(savedBrands) ? savedBrands : [],
    [savedBrands]
  );
  const brandOptions = useMemo(() => knowledgeBrandOptions(brands), [brands]);
  const issues = suppliedIssues ?? parsed.issues;
  const referencedIds = useMemo(
    () => new Set([
      ...referencedSpecificationIds,
      ...referencedSpecificationIdsFromPrices(priceEntries)
    ]),
    [priceEntries, referencedSpecificationIds]
  );
  const slabReferencedIds = useMemo(
    () => new Set(slabReferencedSpecificationIds),
    [slabReferencedSpecificationIds]
  );
  const editingIndex = editingSpecificationId
    ? parsed.specifications.findIndex((entry) => entry.id === editingSpecificationId)
    : -1;
  const editingSpecification = parsed.specifications[editingIndex];

  useEffect(() => {
    if (!readOnly || !brandDialogSpecificationId) return;
    setBrandDialogSpecificationId(null);
    setBrandDialogBrandId(null);
    setBrandName("");
    setBrandNameError(undefined);
  }, [brandDialogSpecificationId, readOnly]);

  useEffect(() => {
    if (!editingSpecificationId || editingIndex >= 0) return;
    setEditingSpecificationId(null);
    setEditorIntent("edit");
  }, [editingIndex, editingSpecificationId]);

  useEffect(() => {
    if (validationAttempt === 0) {
      lastValidationAttempt.current = 0;
      return;
    }
    if (validationAttempt <= lastValidationAttempt.current) return;
    const target = firstValidationTarget(issues, parsed.specifications, brandValues);
    if (!target) return;
    lastValidationAttempt.current = validationAttempt;
    panelInitialFocusRef.current = null;
    panelReturnFocusRef.current = headingRef.current;
    setRequestedFocus({ attempt: validationAttempt, ...target });
    setEditorIntent(readOnly ? "view" : "edit");
    setEditingSpecificationId(target.specificationId);
  }, [brandValues, issues, parsed.specifications, readOnly, validationAttempt]);

  useEffect(() => {
    if (!requestedFocus || editingSpecificationId !== requestedFocus.specificationId) return;
    const timer = window.setTimeout(() => panelInitialFocusRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [editingSpecificationId, requestedFocus]);

  function update(
    nextSpecifications: readonly KnowledgeSpecificationConfiguration[],
    nextBrands: readonly KnowledgeJsonValue[] = brandValues
  ) {
    if (readOnly) return;
    onDirty();
    onChange({
      specifications: serializeKnowledgeSpecifications(nextSpecifications),
      brands: nextBrands
    });
  }

  function replace(specificationId: string, next: KnowledgeSpecificationConfiguration) {
    update(parsed.specifications.map((entry) =>
      entry.id === specificationId ? next : entry
    ));
  }

  function issueFor(path: string): string | undefined {
    return issues.find((issue) => issue.path === path)?.message;
  }

  function brandIssueFor(brandIds: readonly string[]): string | undefined {
    for (const brandId of brandIds) {
      const brandIndex = brandValues.findIndex((brand) => isJsonObject(brand) && stringValue(brand.id) === brandId);
      if (brandIndex < 0) continue;
      const path = `brands.${brandIndex}`;
      const issue = issues.find((entry) => entry.path === path || entry.path.startsWith(`${path}.`));
      if (issue) return issue.message;
    }
    return undefined;
  }

  function associationIssueFor(index: number): string | undefined {
    const prefix = `specifications.${index}.brandId`;
    return issues.find((issue) => issue.path === prefix || issue.path === `${prefix}s` || issue.path.startsWith(`${prefix}s.`))?.message;
  }

  function openEditor(specificationId: string, trigger: HTMLElement, field: SpecificationField = "name") {
    panelReturnFocusRef.current = trigger;
    panelInitialFocusRef.current = null;
    setRequestedFocus({ attempt: -1, specificationId, field });
    setEditorIntent(readOnly ? "view" : "edit");
    setEditingSpecificationId(specificationId);
  }

  function closeEditor() {
    setEditingSpecificationId(null);
    setRequestedFocus(null);
    setEditorIntent("edit");
  }

  function addSpecification(trigger: HTMLElement) {
    const specification = createKnowledgeSpecification();
    update([...parsed.specifications, specification]);
    panelReturnFocusRef.current = trigger;
    panelInitialFocusRef.current = null;
    setRequestedFocus({ attempt: -1, specificationId: specification.id, field: "name" });
    setEditorIntent("add");
    setEditingSpecificationId(specification.id);
  }

  function removeSpecification(specificationId: string) {
    update(parsed.specifications.filter((specification) => specification.id !== specificationId));
    window.setTimeout(() => (addButtonRef.current ?? headingRef.current)?.focus(), 0);
  }

  function openBrandDialog(specificationId: string, select: HTMLElement) {
    if (readOnly) return;
    brandSelectRef.current = select;
    setBrandDialogSpecificationId(specificationId);
    setBrandDialogBrandId(null);
    setBrandName("");
    setBrandNameError(undefined);
  }

  function openBrandEditDialog(specificationId: string, brandId: string, select: HTMLElement) {
    const brand = knowledgeBrandRows(brands).find((candidate) => candidate.brandId === brandId);
    if (!brand) return;
    if (readOnly) return;
    brandSelectRef.current = select;
    setBrandDialogSpecificationId(specificationId);
    setBrandDialogBrandId(brandId);
    setBrandName(brand.name);
    setBrandNameError(undefined);
  }

  function closeBrandDialog() {
    setBrandDialogSpecificationId(null);
    setBrandDialogBrandId(null);
    setBrandName("");
    setBrandNameError(undefined);
  }

  function submitBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !brandDialogSpecificationId) return;

    const trimmedName = brandName.trim();
    const candidateIndex = brandDialogBrandId
      ? brandValues.findIndex((brand) =>
          isJsonObject(brand) && stringValue(brand.id) === brandDialogBrandId
        )
      : brandValues.length;
    if (candidateIndex < 0) {
      setBrandNameError("This Brand is no longer available. Choose another Brand and try again.");
      brandNameRef.current?.focus();
      return;
    }
    const brand = brandDialogBrandId
      ? brandValues[candidateIndex]
      : createKnowledgeBrand(trimmedName);
    const nextBrands = brandDialogBrandId
      ? brandValues.map((entry, index) => index === candidateIndex && isJsonObject(entry)
          ? { ...entry, name: trimmedName }
          : entry)
      : [...brandValues, brand];
    const validationIssues = validateKnowledgeBrands(nextBrands);
    const validationIssue = validationIssues.find((issue) =>
      issue.path === `brands.${candidateIndex}.name`
    ) ?? validationIssues.find((issue) => issue.path === "brands");
    if (validationIssue) {
      setBrandNameError(validationIssue.message);
      brandNameRef.current?.focus();
      return;
    }

    const nextSpecifications = brandDialogBrandId
      ? parsed.specifications
      : parsed.specifications.map((specification) =>
          specification.id === brandDialogSpecificationId
            ? withSpecificationBrandIds(specification, [...specification.brandIds, isJsonObject(brand) ? stringValue(brand.id) : ""])
            : specification
        );
    update(nextSpecifications, nextBrands);
    closeBrandDialog();
  }

  function specificationStatus(
    specification: KnowledgeSpecificationConfiguration,
    index: number
  ): "Saved" | "Unsaved" | "Needs review" {
    if (validationAttempt > 0 && rowIssues(issues, index, specification.brandIds, brandValues).length > 0) {
      return "Needs review";
    }
    const savedSpecification = savedParsed.specifications.find((entry) => entry.id === specification.id);
    if (!savedSpecification || !jsonEqual(
      serializeKnowledgeSpecifications([specification])[0],
      serializeKnowledgeSpecifications([savedSpecification])[0]
    )) return "Unsaved";
    return specification.brandIds.every((brandId) => {
      const currentBrand = brandRecord(brandValues, brandId);
      const savedBrand = brandRecord(savedBrandValues, brandId);
      return currentBrand !== undefined && savedBrand !== undefined && jsonEqual(currentBrand, savedBrand);
    }) ? "Saved" : "Unsaved";
  }

  function fieldInitialRef(field: SpecificationField, element: HTMLElement | null) {
    const desiredField = requestedFocus?.specificationId === editingSpecificationId
      ? requestedFocus.field
      : "name";
    if (field === desiredField) panelInitialFocusRef.current = element;
  }

  return (
    <section className="knowledge-specification-builder" aria-labelledby="knowledge-specifications-title">
      <div className="knowledge-specification-builder__header">
        <div>
          <h3 id="knowledge-specifications-title" ref={headingRef} tabIndex={-1}>Specifications</h3>
          <p>Configure the item, its Brands and concise work guidance.</p>
        </div>
        {!readOnly ? (
          <Button
            ref={addButtonRef}
            type="button"
            variant="secondary"
            size="compact"
            disabled={parsed.specifications.length >= KNOWLEDGE_MAX_SPECIFICATIONS}
            onClick={(event) => addSpecification(event.currentTarget)}
          >
            Add Specification
          </Button>
        ) : null}
      </div>

      {parsed.specifications.length > 0 ? (
        <div className="knowledge-specification-table-scroll">
          <table className="knowledge-specification-table">
            <caption className="sr-only">Configured Specifications</caption>
            <thead>
              <tr>
                <th scope="col">Item name</th>
                <th scope="col">Brands</th>
                <th scope="col">Brief description</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {parsed.specifications.map((specification, index) => {
                const status = specificationStatus(specification, index);
                const protectedReason = slabReferencedIds.has(specification.id)
                  ? "Remove this Specification from Quantity slabs and save Quantity & margin before removing it from Budgeting."
                  : referencedIds.has(specification.id)
                    ? "This Specification is retained by saved configuration or immutable price history and cannot be removed."
                    : undefined;
                const removeReasonId = `${domId(specification.id)}-remove-reason`;
                return (
                  <tr key={specification.id}>
                    <th scope="row" data-label="Item name">
                      <button
                        type="button"
                        className="knowledge-specification-table__item"
                        aria-label={`${readOnly ? "View" : "Edit"} Specification ${index + 1}: ${specification.name.trim() || "Item not named"}`}
                        onClick={(event) => openEditor(specification.id, event.currentTarget)}
                      >
                        {specification.name.trim() || "Item not named"}
                      </button>
                    </th>
                    <td data-label="Brands">{brandLabel(specification.brandIds, brandOptions)}</td>
                    <td data-label="Brief description" className="knowledge-specification-table__description">
                      {specification.description?.trim() || "Not configured"}
                    </td>
                    <td data-label="Status">
                      <span className={`knowledge-specification-status knowledge-specification-status--${status === "Saved" ? "saved" : status === "Unsaved" ? "unsaved" : "review"}`}>
                        {status}
                      </span>
                    </td>
                    <td className="knowledge-specification-table__actions">
                      <div>
                        <Button
                          type="button"
                          variant="quiet"
                          size="compact"
                          aria-label={`${readOnly ? "View" : "Edit"} Specification ${index + 1}`}
                          onClick={(event) => openEditor(specification.id, event.currentTarget)}
                          leadingIcon={<Pencil aria-hidden="true" />}
                        >
                          <span className="sr-only">{readOnly ? "View" : "Edit"}</span>
                        </Button>
                        {!readOnly ? (
                          <>
                            <Button
                              type="button"
                              variant="quiet"
                              size="compact"
                              aria-label={`Remove Specification ${index + 1}: ${specification.name.trim() || "Item not named"}`}
                              disabled={Boolean(protectedReason)}
                              aria-describedby={protectedReason ? removeReasonId : undefined}
                              title={protectedReason}
                              onClick={() => removeSpecification(specification.id)}
                              leadingIcon={<Trash2 aria-hidden="true" />}
                            >
                              <span className="sr-only">Remove</span>
                            </Button>
                            {protectedReason ? <span id={removeReasonId} className="sr-only">{protectedReason}</span> : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="knowledge-specification-builder__empty">
          {readOnly ? "No Specifications configured." : "No Specifications configured. Add one to define an item, Brands and guidance."}
        </p>
      )}

      {editingSpecification ? (
        <ContextPanel
          id="knowledge-specification-editor"
          className="knowledge-context-panel knowledge-specification-panel"
          width="wide"
          title={readOnly
            ? "View Specification"
            : editorIntent === "add"
              ? "Add Specification"
              : "Edit Specification"}
          eyebrow="Specifications"
          description="Changes stay in this Mode draft. Select Done to return, then use Save Mode to keep your changes."
          onClose={closeEditor}
          initialFocusRef={panelInitialFocusRef}
          returnFocusRef={panelReturnFocusRef}
          fallbackFocusRef={headingRef}
          footer={<Button type="button" onClick={closeEditor}>Done</Button>}
        >
          <div className="knowledge-specification-field">
            <div className="knowledge-mode-field__definition">
              <Field
                id={panelFieldId(editingSpecification.id, "name")}
                label="Item name"
                required
                error={issueFor(`specifications.${editingIndex}.name`)}
              >
                {(props) => (
                  itemNameLookup ? <KnowledgeSpecificationItemNamePicker
                    {...props}
                    key={editingSpecification.id}
                    ref={(element) => fieldInitialRef("name", element)}
                    lookup={itemNameLookup}
                    value={editingSpecification.name}
                    draftNames={parsed.specifications.map((entry) => entry.name)}
                    otherRowNames={parsed.specifications.filter((entry) => entry.id !== editingSpecification.id).map((entry) => entry.name)}
                    readOnly={readOnly}
                    onChange={(name) => replace(editingSpecification.id, { ...editingSpecification, name })}
                  /> : <Input
                    {...props}
                    ref={(element) => fieldInitialRef("name", element)}
                    maxLength={240}
                    disabled={readOnly}
                    value={editingSpecification.name}
                    onChange={(event) => replace(editingSpecification.id, {
                      ...editingSpecification,
                      name: event.target.value
                    })}
                  />
                )}
              </Field>
              <Field
                id={panelFieldId(editingSpecification.id, "brand")}
                label="Brands"
                hint={brandValues.length >= KNOWLEDGE_MAX_BRANDS
                  ? `Maximum ${KNOWLEDGE_MAX_BRANDS} Brands reached. Existing Brands remain selectable.`
                  : undefined}
                error={associationIssueFor(editingIndex) ?? brandIssueFor(editingSpecification.brandIds)}
              >
                {(props) => (
                  <KnowledgeBrandMultiSelect
                    {...props}
                    ref={(element) => fieldInitialRef("brand", element)}
                    brands={brandOptions}
                    selectedIds={editingSpecification.brandIds}
                    readOnly={readOnly}
                    addDisabled={brandValues.length >= KNOWLEDGE_MAX_BRANDS}
                    addLabel={brandValues.length >= KNOWLEDGE_MAX_BRANDS ? `Add brand (maximum ${KNOWLEDGE_MAX_BRANDS} reached)` : "Add brand"}
                    onChange={(brandIds) => replace(editingSpecification.id, withSpecificationBrandIds(editingSpecification, brandIds))}
                    onAdd={(trigger) => openBrandDialog(editingSpecification.id, trigger)}
                    onEdit={(brandId, trigger) => openBrandEditDialog(editingSpecification.id, brandId, trigger)}
                  />
                )}
              </Field>
              <Field
                id={panelFieldId(editingSpecification.id, "description")}
                label="Brief description"
                hint="Add concise material or work-detail guidance."
                error={issueFor(`specifications.${editingIndex}.description`)}
                className="knowledge-specification-field__description"
              >
                {(props) => (
                  <Textarea
                    {...props}
                    ref={(element) => fieldInitialRef("description", element)}
                    rows={1}
                    maxLength={4_000}
                    disabled={readOnly}
                    value={editingSpecification.description ?? ""}
                    onChange={(event) => replace(editingSpecification.id, {
                      ...editingSpecification,
                      description: event.target.value
                    })}
                  />
                )}
              </Field>
            </div>
          </div>
        </ContextPanel>
      ) : null}

      {brandDialogSpecificationId ? (
        <Dialog
          title={brandDialogBrandId ? "Edit Brand" : "Add Brand"}
          eyebrow="Specification"
          description={brandDialogBrandId
            ? "Update this Brand everywhere it is selected in Specifications."
            : "Create a Brand and select it for this item."}
          onClose={closeBrandDialog}
          initialFocusRef={brandNameRef}
          returnFocusRef={brandSelectRef}
        >
          <form className="ui-dialog__form knowledge-dialog-form knowledge-brand-dialog" onSubmit={submitBrand} noValidate>
            <div className="ui-dialog__body knowledge-dialog-body">
              <Field id="knowledge-new-brand-name" label="Brand name" required error={brandNameError}>
                {(props) => (
                  <Input
                    {...props}
                    ref={brandNameRef}
                    maxLength={MAX_BRAND_NAME_LENGTH}
                    autoComplete="off"
                    value={brandName}
                    onChange={(event) => {
                      setBrandName(event.target.value);
                      if (brandNameError) setBrandNameError(undefined);
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="ui-dialog__actions knowledge-dialog-actions">
              <Button type="button" variant="destructive-outline" onClick={closeBrandDialog}>Cancel</Button>
              <Button type="submit">{brandDialogBrandId ? "Save" : "Add"}</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

interface KnowledgeBrandRow {
  readonly brandId: string;
  readonly name: string;
}

interface KnowledgeBrandOption {
  readonly id: string;
  readonly name: string;
}

function knowledgeBrandRows(value: KnowledgeJsonValue | undefined): readonly KnowledgeBrandRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isJsonObject(entry)) return [];
    return [{ brandId: stringValue(entry.id), name: stringValue(entry.name) }];
  });
}

function knowledgeBrandOptions(value: KnowledgeJsonValue | undefined): readonly KnowledgeBrandOption[] {
  const rows = knowledgeBrandRows(value);
  return rows.flatMap((brand, index) => {
    if (!brand.brandId || rows.filter((candidate) => candidate.brandId === brand.brandId).length !== 1) return [];
    return [{ id: brand.brandId, name: brand.name.trim() || `Unnamed Brand ${index + 1}` }];
  });
}

function brandLabel(brandIds: readonly string[], brands: readonly KnowledgeBrandOption[]): string {
  return brandIds.length ? brandIds.map((brandId) => brands.find((brand) => brand.id === brandId)?.name ?? "Unavailable Brand").join(", ") : "Not configured";
}

function brandRecord(brands: readonly KnowledgeJsonValue[], brandId: string): KnowledgeJsonValue | undefined {
  return brands.find((brand) => isJsonObject(brand) && stringValue(brand.id) === brandId);
}

function rowIssues(
  issues: readonly KnowledgeSpecificationIssue[],
  specificationIndex: number,
  brandIds: readonly string[],
  brands: readonly KnowledgeJsonValue[]
): readonly KnowledgeSpecificationIssue[] {
  const specificationPath = `specifications.${specificationIndex}`;
  const brandPaths = brands.flatMap((brand, index) => isJsonObject(brand) && brandIds.includes(stringValue(brand.id)) ? [`brands.${index}`] : []);
  return issues.filter((issue) =>
    issue.path === specificationPath
    || issue.path.startsWith(`${specificationPath}.`)
    || brandPaths.some((path) => issue.path === path || issue.path.startsWith(`${path}.`))
  );
}

function firstValidationTarget(
  issues: readonly KnowledgeSpecificationIssue[],
  specifications: readonly KnowledgeSpecificationConfiguration[],
  brands: readonly KnowledgeJsonValue[]
): { readonly specificationId: string; readonly field: SpecificationField } | null {
  for (let index = 0; index < specifications.length; index += 1) {
    const specification = specifications[index]!;
    const path = `specifications.${index}`;
    const specificationIssue = issues.find((issue) =>
      issue.path === path || issue.path.startsWith(`${path}.`)
    );
    if (specificationIssue) {
      const property = specificationIssue.path.slice(path.length + 1);
      return {
        specificationId: specification.id,
        field: (property === "brandId" || property === "brandIds" || property.startsWith("brandIds.")) ? "brand" : property === "description" ? "description" : "name"
      };
    }
    if (specification.brandIds.some((brandId) => {
      const brandIndex = brands.findIndex((brand) => isJsonObject(brand) && stringValue(brand.id) === brandId);
      if (brandIndex < 0) return false;
      const path = `brands.${brandIndex}`;
      return issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
    })) return { specificationId: specification.id, field: "brand" };
  }
  return null;
}

function createKnowledgeBrand(name: string): Record<string, KnowledgeJsonValue> {
  const random = globalThis.crypto?.randomUUID?.();
  const suffix = random ?? `${Date.now().toString(36)}-${nextBrandId()}`;
  return { id: `knowledge-brand-${suffix}`, name };
}

let fallbackBrandId = 0;
function nextBrandId(): number {
  fallbackBrandId += 1;
  return fallbackBrandId;
}

function jsonEqual(left: KnowledgeJsonValue | undefined, right: KnowledgeJsonValue | undefined): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: KnowledgeJsonValue | undefined): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const object = value as Record<string, KnowledgeJsonValue>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function isJsonObject(value: KnowledgeJsonValue): value is Record<string, KnowledgeJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function domId(id: string): string {
  return `knowledge-specification-${id.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function panelFieldId(specificationId: string | null, field: SpecificationField): string {
  return `${domId(specificationId ?? "editor")}-${field}`;
}
