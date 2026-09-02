import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  createKnowledgeMaster,
  updateKnowledgeMaster,
  type KnowledgeCreateMasterInput,
  type KnowledgeTaxVersionInput
} from "./knowledgeApi";
import { syncKnowledgeMasterMutation } from "./knowledgeMutationSync";
import type { KnowledgeMaster, KnowledgeMasterType } from "./knowledgeTypes";

interface KnowledgeMasterEditorDialogProps {
  readonly masterType: KnowledgeMasterType;
  readonly existing?: KnowledgeMaster;
  readonly quickAdd?: boolean;
  readonly onClose: () => void;
  readonly onSaved?: (master: KnowledgeMaster) => void;
}

const MASTER_SINGULAR_LABELS = {
  uoms: "UOM",
  vendors: "Vendor",
  taxes: "Tax",
  priorities: "Priority",
  surfaces: "Surface",
  modes: "Mode"
} as const satisfies Readonly<Record<KnowledgeMasterType, string>>;

export function KnowledgeMasterEditorDialog({
  masterType,
  existing,
  quickAdd = false,
  onClose,
  onSaved
}: KnowledgeMasterEditorDialogProps) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(existing?.displayOrder ?? ""));
  const [status, setStatus] = useState<"active" | "inactive">(
    existing?.status === "inactive" ? "inactive" : "active"
  );
  const [decimalScale, setDecimalScale] = useState(String(existing?.decimalScale ?? 0));
  const [includeTaxVersion, setIncludeTaxVersion] = useState(!existing && masterType === "taxes");
  const [taxRateBps, setTaxRateBps] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");
  const [taxApplicability, setTaxApplicability] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [taxStatus, setTaxStatus] = useState<"draft" | "active" | "inactive">(
    quickAdd && !existing && masterType === "taxes" ? "active" : "draft"
  );

  const taxVersion = useMemo<KnowledgeTaxVersionInput | undefined>(() => {
    if (masterType !== "taxes" || !includeTaxVersion) return undefined;
    const from = toIso(effectiveFrom);
    const to = effectiveTo ? toIso(effectiveTo) : null;
    const rateBps = Number(taxRateBps);
    if (!from || (effectiveTo && !to) || !Number.isInteger(rateBps)) return undefined;
    return {
      rateBps,
      treatment: taxTreatment,
      applicability: taxApplicability.trim(),
      effectiveFrom: from,
      effectiveTo: to,
      status: taxStatus
    };
  }, [effectiveFrom, effectiveTo, includeTaxVersion, masterType, taxApplicability, taxRateBps, taxStatus, taxTreatment]);

  const formValid = Boolean(
    code.trim() &&
      name.trim() &&
      (!existing || (
        displayOrder.trim() !== "" &&
        Number.isSafeInteger(Number(displayOrder)) &&
        Number(displayOrder) >= 0
      )) &&
      (masterType !== "uoms" || [0, 1, 2, 3].includes(Number(decimalScale))) &&
      (masterType !== "taxes" || !includeTaxVersion || (taxVersion && taxApplicability.trim()))
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const common: KnowledgeCreateMasterInput = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        ...(masterType === "uoms" ? { decimalScale: Number(decimalScale) } : {}),
        ...(taxVersion ? { taxVersion } : {})
      };
      if (!existing) return createKnowledgeMaster(masterType, common);
      return updateKnowledgeMaster(masterType, existing.id, {
        ...common,
        displayOrder: Number(displayOrder),
        expectedVersion: existing.version,
        status
      });
    },
    onSuccess: async (master) => {
      await syncKnowledgeMasterMutation(queryClient, masterType);
      onSaved?.(master);
      onClose();
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formValid) mutation.mutate();
  }

  const itemLabel = MASTER_SINGULAR_LABELS[masterType];
  return (
    <Dialog
      title={`${existing ? "Edit" : quickAdd ? "Quick add" : "Add"} ${itemLabel}`}
      eyebrow="Estimation configuration"
      description={
        quickAdd
          ? "The value will become available in this item workspace after it is saved."
          : "Reusable values are shared by the additive AI estimator knowledge base."
      }
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="knowledge-dialog-form knowledge-dialog-form--wide" onSubmit={submit}>
        <div className="knowledge-dialog-body">
          {mutation.error ? (
            <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage>
          ) : null}
          <div className="knowledge-form-grid">
            <Field id="master-code" label="Code" required>
              {(props) => <Input {...props} value={code} maxLength={64} onChange={(event) => setCode(event.target.value)} />}
            </Field>
            <Field id="master-name" label="Name" required>
              {(props) => <Input {...props} value={name} maxLength={240} onChange={(event) => setName(event.target.value)} />}
            </Field>
            {existing ? (
              <Field id="master-order" label="Display order" required>
                {(props) => <Input {...props} type="number" min={0} step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />}
              </Field>
            ) : null}
            {existing ? (
              <Field id="master-status" label="Status">
                {(props) => <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}
              </Field>
            ) : null}
            {masterType === "uoms" ? (
              <Field id="master-decimal-scale" label="Quantity decimal places" required>
                {(props) => <Select {...props} value={decimalScale} onChange={(event) => setDecimalScale(event.target.value)}>{[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}</Select>}
              </Field>
            ) : null}
          </div>
          <Field id="master-description" label="Description">
            {(props) => <Textarea {...props} value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} />}
          </Field>

          {masterType === "taxes" ? (
            <fieldset className="knowledge-fieldset">
              <legend>Tax version</legend>
              {existing ? (
                <label className="knowledge-checkbox-row">
                  <Checkbox checked={includeTaxVersion} onChange={(event) => setIncludeTaxVersion(event.target.checked)} />
                  Append a new tax version
                </label>
              ) : null}
              {includeTaxVersion ? (
                <div className="knowledge-form-grid">
                  <Field id="tax-rate" label="Rate (basis points)" hint="For example, 1800 is 18%." required>
                    {(props) => <Input {...props} type="number" min={0} max={100000} step={1} value={taxRateBps} onChange={(event) => setTaxRateBps(event.target.value)} />}
                  </Field>
                  <Field id="tax-treatment" label="Treatment" required>
                    {(props) => <Select {...props} value={taxTreatment} onChange={(event) => setTaxTreatment(event.target.value as "exclusive" | "inclusive")}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></Select>}
                  </Field>
                  <Field id="tax-applicability" label="Applicability" required>
                    {(props) => <Input {...props} value={taxApplicability} onChange={(event) => setTaxApplicability(event.target.value)} />}
                  </Field>
                  {!quickAdd ? (
                    <Field id="tax-version-status" label="Version status" required>
                      {(props) => <Select {...props} value={taxStatus} onChange={(event) => setTaxStatus(event.target.value as typeof taxStatus)}><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option></Select>}
                    </Field>
                  ) : null}
                  <Field id="tax-effective-from" label="Effective from" required>
                    {(props) => <Input {...props} type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />}
                  </Field>
                  <Field id="tax-effective-to" label="Effective to">
                    {(props) => <Input {...props} type="datetime-local" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />}
                  </Field>
                </div>
              ) : (
                <p className="knowledge-help-text">Existing tax-version details remain unchanged.</p>
              )}
            </fieldset>
          ) : null}
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" busy={mutation.isPending} disabled={!formValid}>{existing ? "Save changes" : `Add ${itemLabel}`}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
