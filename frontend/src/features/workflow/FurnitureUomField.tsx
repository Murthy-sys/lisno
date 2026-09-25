import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { projectProcurementKeys } from "../procurement/projectProcurementApi";
import { createFurnitureUom, projectWorkflowKeys, type FurnitureUomOption } from "./projectWorkflowApi";

import "./furnitureUomField.css";

export interface FurnitureUomFieldProps {
  id: string;
  projectId: string;
  value: string;
  previousUnit?: { code: string; name?: string };
  options: FurnitureUomOption[];
  loading: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  onRetry: () => void;
  onBusyChange?: (busy: boolean) => void;
}

function normalizeLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function FurnitureUomField({
  id, projectId, value, previousUnit, options, loading, error, disabled = false,
  onChange, onRetry, onBusyChange
}: FurnitureUomFieldProps) {
  const queryClient = useQueryClient();
  const addRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [decimalScale, setDecimalScale] = useState(3);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string; name?: string }>({});
  const [notice, setNotice] = useState("");
  const formId = `${id}-add-form`;
  const missingValue = Boolean(value && !options.some((option) => option.id === value));
  const previousLabel = previousUnit
    ? `${previousUnit.code}${previousUnit.name && previousUnit.name !== previousUnit.code ? ` · ${previousUnit.name}` : ""}`
    : "Previous UOM";

  useEffect(() => {
    busyCallback.current?.(adding);
  }, [adding]);
  useEffect(() => () => busyCallback.current?.(false), []);

  const create = useMutation({
    mutationFn: (input: { code: string; name: string; decimalScale: number }) => createFurnitureUom(projectId, input),
    onSuccess: async ({ uom, reused }) => {
      // An older in-flight options request must not overwrite the unit just saved.
      await queryClient.cancelQueries({ queryKey: projectWorkflowKeys.furnitureUoms(projectId) });
      queryClient.setQueryData<FurnitureUomOption[]>(projectWorkflowKeys.furnitureUoms(projectId), (current) => {
        const existing = current ?? options;
        return existing.some((option) => option.id === uom.id)
          ? existing.map((option) => option.id === uom.id ? uom : option)
          : [...existing, uom];
      });
      onChange(uom.id);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.allFurnitureUoms() }),
        queryClient.invalidateQueries({ queryKey: projectProcurementKeys.uoms }),
        syncKnowledgeMasterMutation(queryClient, "uoms")
      ]);
      setNotice(reused
        ? `${uom.code} already exists and is now selected. Its saved settings were kept.`
        : `${uom.code} is selected and saved in Configuration for future projects.`);
      setAdding(false);
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The panel is portalled, but React events still reach the enclosing measurement form.
    event.stopPropagation();
    if (create.isPending || disabled) return;
    const normalizedCode = normalizeLabel(code);
    const normalizedName = normalizeLabel(name);
    const nextErrors = {
      ...(!normalizedCode || normalizedCode.length > 64 ? { code: "Enter a UOM code of up to 64 characters." } : {}),
      ...(!normalizedName || normalizedName.length > 240 ? { name: "Enter a UOM name of up to 240 characters." } : {})
    };
    setFieldErrors(nextErrors);
    if (nextErrors.code || nextErrors.name) {
      (nextErrors.code ? codeRef : nameRef).current?.focus();
      return;
    }
    create.mutate({ code: normalizedCode, name: normalizedName, decimalScale });
  }

  const hint = !loading && !error && missingValue
    ? `Previously saved as ${previousLabel}. Choose an active UOM before submitting.`
    : previousUnit && !value
      ? `Previous unit: ${previousLabel}. Select its configured UOM to continue.`
      : !loading && !error && !options.length ? "No active UOMs. Add a unit to continue." : undefined;

  return <div className="furniture-uom-field">
    <Field id={id} label="UOM" required hint={hint} error={error}>
      {(props) => <Select {...props} value={value} disabled={disabled || loading || Boolean(error)} onChange={(event) => {
        onChange(event.target.value); setNotice("");
      }}>
        <option value="" disabled>{loading ? "Loading UOMs…" : "Choose UOM"}</option>
        {missingValue ? <option value={value} disabled>{loading ? "Loading saved UOM…" : `${previousLabel} (unavailable)`}</option> : null}
        {options.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}
      </Select>}
    </Field>
    <div className="furniture-uom-field__actions">
      {error ? <Button variant="quiet" size="compact" disabled={disabled || loading} onClick={onRetry}>Retry UOMs</Button> : null}
      <Button ref={addRef} variant="quiet" size="compact" disabled={disabled || adding} onClick={() => {
        setCode(""); setName(""); setDecimalScale(3); setFieldErrors({}); setNotice(""); create.reset(); setAdding(true);
      }}>Add UOM</Button>
    </div>
    {notice ? <p role="status" className="furniture-uom-field__notice">{notice}</p> : null}
    {adding ? <ContextPanel
      title="Add UOM" eyebrow="Reusable configuration"
      description="Save a unit of measurement for this and future projects."
      width="narrow" className="furniture-uom-panel"
      dirty={Boolean(code || name || decimalScale !== 3)} busy={create.isPending}
      initialFocusRef={codeRef} returnFocusRef={addRef}
      onClose={() => setAdding(false)}
      footer={({ requestClose }) => <div className="furniture-uom-panel__actions">
        <Button variant="destructive-outline" disabled={create.isPending} onClick={requestClose}>Cancel</Button>
        <Button type="submit" form={formId} disabled={disabled} busy={create.isPending} busyLabel="Saving UOM…">Save UOM</Button>
      </div>}
    >
      <form id={formId} className="furniture-uom-panel__form" onSubmit={submit} noValidate>
        {create.isError ? <InlineMessage tone="error" role="alert">{create.error instanceof Error ? create.error.message : "The UOM could not be saved. Try again."}</InlineMessage> : null}
        {disabled ? <InlineMessage tone="warning">The measurement form is no longer editable. Close this panel and review the updated workflow.</InlineMessage> : null}
        <fieldset disabled={create.isPending || disabled}>
          <Field id={`${id}-code`} label="UOM code" required error={fieldErrors.code} hint="Short label, such as mm or cm.">
            {(props) => <Input {...props} ref={codeRef} value={code} maxLength={64} autoComplete="off" onChange={(event) => {
              setCode(event.target.value); setFieldErrors((current) => ({ ...current, code: undefined })); create.reset();
            }} />}
          </Field>
          <Field id={`${id}-name`} label="UOM name" required error={fieldErrors.name}>
            {(props) => <Input {...props} ref={nameRef} value={name} maxLength={240} autoComplete="off" onChange={(event) => {
              setName(event.target.value); setFieldErrors((current) => ({ ...current, name: undefined })); create.reset();
            }} />}
          </Field>
          <Field id={`${id}-decimals`} label="Quantity decimal places" hint="Used for estimate quantities. Your length, width and height measurements retain their entered precision.">
            {(props) => <Select {...props} value={decimalScale} onChange={(event) => { setDecimalScale(Number(event.target.value)); create.reset(); }}>
              {[0, 1, 2, 3].map((scale) => <option key={scale} value={scale}>{scale}</option>)}
            </Select>}
          </Field>
        </fieldset>
        <p className="furniture-uom-panel__hint">Saving adds this UOM to Configuration, even if you later cancel the furniture submission.</p>
      </form>
    </ContextPanel> : null}
  </div>;
}
