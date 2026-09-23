import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type RefObject } from "react";

import { ApiError } from "../../api/client";
import type { ProjectProcurementItem, ProcurementVendorReference } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import {
  createProjectProcurementItem,
  getProjectProcurementItem,
  getProcurementUomOptions,
  MAX_PROCUREMENT_ITEM_PRICE_PAISE,
  projectProcurementKeys,
  updateProjectProcurementItem,
  type ProjectProcurementItemInput,
  type ProcurementParentSource,
  type ProcurementParentOption,
  sameProcurementParent
} from "./projectProcurementApi";
import { procurementError, rupeesToPaise } from "./procurementPresentation";
import { ProcurementVendorField } from "./ProcurementVendorField";
import { procurementKeys } from "./procurementApi";

interface Props {
  projectId: string;
  projectName: string;
  item: ProjectProcurementItem | null;
  onClose: () => void;
  onSaved: (item: ProjectProcurementItem) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  source?: ProcurementParentSource;
  assignmentOptions?: ProcurementParentOption[];
  parentLabel?: string;
  sourceStale?: boolean;
}

function draftFor(item: ProjectProcurementItem | null) {
  return {
    itemName: item?.itemName ?? "",
    brand: item?.brand ?? "",
    uomId: item?.uom.id ?? "",
    price: item ? `${Math.floor(item.pricePaise / 100)}.${String(item.pricePaise % 100).padStart(2, "0")}` : ""
  };
}

export function ProjectProcurementItemEditor({ projectId, projectName, item, onClose, onSaved, returnFocusRef, fallbackFocusRef, source, assignmentOptions, parentLabel, sourceStale = false }: Props) {
  const queryClient = useQueryClient();
  const [baseItem, setBaseItem] = useState(item);
  const [draft, setDraft] = useState(() => draftFor(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vendor, setVendor] = useState<ProcurementVendorReference | null>(item?.vendor ?? null);
  const [vendorBusy, setVendorBusy] = useState(false);
  const [vendorUnresolved, setVendorUnresolved] = useState(false);
  const [vendorFieldRevision, setVendorFieldRevision] = useState(0);
  const [assignment, setAssignment] = useState<ProcurementParentSource | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initialDraft = draftFor(baseItem);
  const dirty = Boolean(assignment) || vendorUnresolved || (vendor?.id ?? null) !== (baseItem?.vendor?.id ?? null)
    || Object.keys(draft).some((key) => draft[key as keyof typeof draft] !== initialDraft[key as keyof typeof draft]);
  const uoms = useQuery({
    queryKey: projectProcurementKeys.uoms,
    queryFn: getProcurementUomOptions,
    staleTime: 60_000
  });
  const save = useMutation({
    mutationFn: (input: ProjectProcurementItemInput & Partial<ProcurementParentSource>) => baseItem
      ? updateProjectProcurementItem(projectId, baseItem.id, { ...input, expectedVersion: baseItem.version })
      : createProjectProcurementItem(projectId, input as ProjectProcurementItemInput & ProcurementParentSource),
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) }),
        queryClient.invalidateQueries({ queryKey: procurementKeys.projects }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      onSaved(saved);
    },
    onError: (error) => {
      if (error instanceof ApiError && ["PROCUREMENT_ITEM_SOURCE_CONFLICT", "PROCUREMENT_APPROVAL_SOURCE_CONFLICT"].includes(error.code)) {
        void queryClient.invalidateQueries({ queryKey: procurementKeys.projects });
        void queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) });
      }
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields);
        if (error.fields.uomId) void queryClient.invalidateQueries({ queryKey: projectProcurementKeys.uoms });
        if (error.fields.vendorId) void queryClient.invalidateQueries({ queryKey: projectProcurementKeys.vendors });
      }
    }
  });
  const reload = useMutation({
    mutationFn: () => getProjectProcurementItem(projectId, baseItem!.id, source),
    onSuccess: (latest) => {
      setBaseItem(latest);
      setDraft(draftFor(latest));
      setVendor(latest.vendor);
      setVendorUnresolved(false);
      setAssignment(null);
      setVendorFieldRevision((previous) => previous + 1);
      setErrors({});
      save.reset();
      void queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) });
      void uoms.refetch();
      firstField.current?.focus();
    }
  });
  const busy = save.isPending || reload.isPending || vendorBusy;
  const conflict = save.error instanceof ApiError && save.error.code === "PROCUREMENT_ITEM_VERSION_CONFLICT";
  const sourceConflict = sourceStale || Boolean(assignment && !assignmentOptions?.some((option) => sameProcurementParent(assignment, option))) || (save.error instanceof ApiError && ["PROCUREMENT_ITEM_SOURCE_CONFLICT", "PROCUREMENT_APPROVAL_SOURCE_CONFLICT"].includes(save.error.code));
  const unchangedUom = Boolean(baseItem && draft.uomId === baseItem.uom.id);
  const hasSelectedActiveUom = Boolean(uoms.data?.some((uom) => uom.id === draft.uomId));
  const historicalUom = baseItem && !uoms.data?.some((uom) => uom.id === baseItem.uom.id)
    ? baseItem.uom : null;

  function change(key: keyof typeof draft, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "", ...(key === "price" ? { pricePaise: "" } : {}) }));
    // A version conflict must be resolved explicitly before another write.
    if (!conflict && !sourceConflict) save.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || conflict || sourceConflict) return;
    const itemName = draft.itemName.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const brand = draft.brand.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const pricePaise = rupeesToPaise(draft.price);
    const nextErrors: Record<string, string> = {};
    const selectedSource = source ?? baseItem?.estimateSource ?? assignment;
    if ((!baseItem || assignment) && !selectedSource) nextErrors.estimateSource = "Choose a current approved estimate item.";
    if (!itemName || itemName.length > 200) nextErrors.itemName = "Enter an item name of up to 200 characters.";
    if (!brand || brand.length > 200) nextErrors.brand = "Enter a brand of up to 200 characters.";
    if (!draft.uomId || (!unchangedUom && !hasSelectedActiveUom)) nextErrors.uomId = "Choose an available unit of measure.";
    if (vendorUnresolved) nextErrors.vendorId = "Select a saved vendor, save the new vendor, or clear the vendor entry.";
    if (pricePaise === null || pricePaise > MAX_PROCUREMENT_ITEM_PRICE_PAISE) {
      nextErrors.pricePaise = "Enter a positive price up to ₹90,00,00,00,000.00 with at most two decimal places.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    save.mutate({ itemName, brand, uomId: draft.uomId, vendorId: vendor?.id ?? null, pricePaise: pricePaise!,
      ...(selectedSource ? { estimateId: selectedSource.estimateId, estimateVersion: selectedSource.estimateVersion, sourceLineItemKey: selectedSource.sourceLineItemKey } : {}) });
  }

  return (
    <ContextPanel
      title={baseItem ? "Edit procurement item" : "Add procurement item"}
      eyebrow={projectName}
      description={parentLabel ? `For ${parentLabel}. Enter the price per unit.` : "Item details and unit price are saved for this project."}
      className="project-procurement-items-editor"
      width="medium"
      dirty={dirty}
      busy={busy}
      onClose={onClose}
      initialFocusRef={firstField}
      returnFocusRef={returnFocusRef}
      fallbackFocusRef={fallbackFocusRef}
      footer={({ requestClose }) => (
        <div className="project-procurement-items-editor__actions">
          <Button variant="destructive-outline" onClick={requestClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="project-procurement-items-form" busy={save.isPending}
            busyLabel="Saving…" disabled={busy || conflict || sourceConflict || (!unchangedUom && (!uoms.data?.length || uoms.isError))}>
            {baseItem ? "Save changes" : "Add item"}
          </Button>
        </div>
      )}
    >
      <form id="project-procurement-items-form" ref={formRef} onSubmit={submit} noValidate className="project-procurement-items-editor__form">
        {sourceConflict ? <InlineMessage tone="error">The approved estimate changed or this assignment is no longer available. Your entries are preserved. Close this form and refresh the project to review the current estimate before saving.</InlineMessage> : null}
        {save.isError && !sourceConflict ? (
          <InlineMessage tone="error">
            {conflict ? "Someone updated this item. Your entries are preserved. Reload the latest record to replace these entries and edit the current version." : procurementError(save.error, "The item could not be saved. Try again.")}
          </InlineMessage>
        ) : null}
        {conflict ? (
          <Button variant="secondary" onClick={() => reload.mutate()} busy={reload.isPending} busyLabel="Reloading…">
            Reload latest and replace entries
          </Button>
        ) : null}
        {reload.isError ? <InlineMessage tone="error">{procurementError(reload.error, "The latest item could not be loaded. Your entries are still available.")}</InlineMessage> : null}
        <fieldset disabled={busy}>
          {baseItem && !baseItem.estimateSource && !source && assignmentOptions ? <Field id="procurement-item-assignment" label="Estimate item" error={errors.estimateSource}
            hint="Select an approved estimate item to assign this saved item. Its assignment cannot be changed after saving.">
            {(props) => <Select {...props} value={assignment?.sourceLineItemKey ?? ""} onChange={(event) => setAssignment(assignmentOptions.find((option) => option.sourceLineItemKey === event.target.value) ?? null)}>
              <option value="">Keep unassigned</option>
              {assignmentOptions.map((option) => <option key={option.sourceLineItemKey} value={option.sourceLineItemKey}>{option.label}</option>)}
            </Select>}
          </Field> : null}
          <Field id="procurement-item-name" label="Item name" required error={errors.itemName}>
            {(props) => <Input {...props} ref={firstField} value={draft.itemName} maxLength={200} onChange={(event) => change("itemName", event.target.value)} autoComplete="off" />}
          </Field>
          <Field id="procurement-item-brand" label="Brand" required error={errors.brand}>
            {(props) => <Input {...props} value={draft.brand} maxLength={200} onChange={(event) => change("brand", event.target.value)} autoComplete="off" />}
          </Field>
          <ProcurementVendorField key={vendorFieldRevision} projectId={projectId} suggestionsDisabled={sourceStale || sourceConflict} value={vendor} error={errors.vendorId}
            onChange={(selected) => {
              setVendor(selected);
              setErrors((previous) => ({ ...previous, vendorId: "" }));
              if (!conflict && !sourceConflict) save.reset();
            }} onBusyChange={setVendorBusy} onUnresolvedChange={setVendorUnresolved} />
          <Field id="procurement-item-uom" label="UOM" required error={errors.uomId}
            hint="Active units from Configuration.">
            {(props) => <Select {...props} value={draft.uomId} onChange={(event) => change("uomId", event.target.value)} disabled={uoms.isPending || uoms.isError}>
              <option value="">Select a unit</option>
              {historicalUom ? <option value={historicalUom.id}>{historicalUom.code} — {historicalUom.name}{historicalUom.status === "active" ? " (current unit)" : " (unavailable for new items)"}</option> : null}
              {(uoms.data ?? []).map((uom) => <option key={uom.id} value={uom.id}>{uom.code} — {uom.name}</option>)}
            </Select>}
          </Field>
          {uoms.isPending ? <p role="status">Loading units of measure…</p> : uoms.isError ? (
            <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void uoms.refetch()}>Retry units</Button>}>
              Units of measure could not be loaded.{baseItem ? " You can keep the current unit while updating the other fields." : " Retry before adding an item."}
            </InlineMessage>
          ) : !uoms.data.length ? <InlineMessage tone="warning">No active units are available. Ask an administrator to activate a unit of measure.{baseItem ? " The current unit can be retained." : ""}</InlineMessage> : null}
          {baseItem && unchangedUom && baseItem.uom.status !== "active" ? <InlineMessage tone="warning">This item's current unit is {baseItem.uom.status}. You can retain it or choose an active unit.</InlineMessage> : null}
          <Field id="procurement-item-price" label="Price (INR)" required error={errors.pricePaise}
            hint="Unit price in rupees per selected UOM. Up to 2 decimal places.">
            {(props) => <Input {...props} type="text" inputMode="decimal" value={draft.price} maxLength={20} onChange={(event) => change("price", event.target.value)} placeholder="0.00" />}
          </Field>
        </fieldset>
      </form>
    </ContextPanel>
  );
}
