import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import {
  createKnowledgeQualityControlOption,
  listKnowledgeQualityControlOptions
} from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { isQualityControlOptionReference, normalizeQualityControlOptionName, qualityControlSelectOptions } from "./knowledgeQuality";
import type {
  KnowledgeQualityControlOptionKind,
  KnowledgeQualityControlOptionListResponse,
  KnowledgeQualityControlOptionSummary
} from "./knowledgeTypes";

interface Props {
  readonly kind: KnowledgeQualityControlOptionKind;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSaved: (value: string, name: string, created: boolean) => void;
  readonly onClose: () => void;
}

const LABELS = {
  frequency: { title: "Add frequency", noun: "frequency", list: "Frequency" },
  performer: { title: "Add performed-by value", noun: "performed-by value", list: "Performed by" }
} as const;

export function KnowledgeQualityControlOptionDialog({ kind, returnFocusRef, onSaved, onClose }: Props) {
  const labels = LABELS[kind];
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const currentNameRef = useRef("");
  const reconciliationSequence = useRef(0);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [existing, setExisting] = useState<{ readonly value: string; readonly name: string } | null>(null);
  const normalizedName = normalizeQualityControlOptionName(name);
  const valid = normalizedName.length > 0 && name.trim().length <= 80;
  useEffect(() => () => {
    reconciliationSequence.current += 1;
  }, []);
  const mutation = useMutation({
    mutationFn: (submittedName: string) => createKnowledgeQualityControlOption({ kind, name: submittedName.trim() }),
    onSuccess: option => {
      cacheOption(queryClient, option);
      onSaved(option.id, option.name, true);
      onClose();
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.qualityControlOptions(kind),
        exact: true
      }).catch(() => undefined);
    },
    onError: (failure, submittedName) => {
      if (!(failure instanceof ApiError) || failure.status !== 409) return;
      const attempt = ++reconciliationSequence.current;
      const submittedNormalizedName = normalizeQualityControlOptionName(submittedName);
      setReconciling(true);
      const existingId = failure.fields?.existingOptionId;
      const existingName = failure.fields?.existingOptionName;
      const cached = queryClient.getQueryData<KnowledgeQualityControlOptionListResponse>(
        knowledgeQueryKeys.qualityControlOptions(kind)
      );
      const cachedCustom = cached?.items.find(option =>
        option.kind === kind && (existingId ? option.id === existingId : normalizeQualityControlOptionName(option.name) === submittedNormalizedName)
      );
      const builtIn = qualityControlSelectOptions(kind, undefined).find(option =>
        normalizeQualityControlOptionName(option.label) === normalizeQualityControlOptionName(existingName ?? submittedName)
      );
      const conflictCustom = cachedCustom ?? (
        isQualityControlOptionReference(existingId) && existingName
          ? { id: existingId, kind, name: existingName }
          : undefined
      );
      const immediate = conflictCustom
        ? { value: conflictCustom.id, name: conflictCustom.name }
        : builtIn ? { value: builtIn.value, name: builtIn.label } : null;
      if (conflictCustom) cacheOption(queryClient, conflictCustom);
      if (immediate) setExisting(immediate);
      setReconciling(false);
      void listKnowledgeQualityControlOptions(kind).then(response => {
        if (
          reconciliationSequence.current !== attempt ||
          normalizeQualityControlOptionName(currentNameRef.current) !== submittedNormalizedName
        ) return;
        queryClient.setQueryData(knowledgeQueryKeys.qualityControlOptions(kind), response);
        const custom = response.items.find(option => existingId ? option.id === existingId : normalizeQualityControlOptionName(option.name) === submittedNormalizedName);
        const refreshedBuiltIn = !custom ? qualityControlSelectOptions(kind, undefined).find(option => normalizeQualityControlOptionName(option.label) === normalizeQualityControlOptionName(existingName ?? submittedName)) : undefined;
        setExisting(custom ? { value: custom.id, name: custom.name } : refreshedBuiltIn ? { value: refreshedBuiltIn.value, name: refreshedBuiltIn.label } : immediate);
      }).catch(() => undefined);
    }
  });
  const busy = mutation.isPending || reconciling;
  const error = mutation.error instanceof ApiError
    ? mutation.error.fields?.name ?? mutation.error.message
    : mutation.error instanceof Error ? mutation.error.message : null;

  return <ContextPanel
    title={labels.title}
    eyebrow="Quality Parameters"
    description={`Add one reusable value to the ${labels.list} list.`}
    busy={busy}
    dirty={Boolean(name)}
    onClose={onClose}
    initialFocusRef={nameRef}
    returnFocusRef={returnFocusRef}
    width="medium"
    className="knowledge-context-panel knowledge-quality-option-panel"
    footer={({ requestClose }) => <div className="knowledge-dialog-actions">
      <Button type="button" variant="quiet" disabled={busy} onClick={requestClose}>Cancel</Button>
      {existing ? <Button type="button" disabled={busy} onClick={() => { onSaved(existing.value, existing.name, false); onClose(); }}>Use existing value</Button>
        : <Button type="submit" form={formId} busy={busy} disabled={!valid || busy}>Add {labels.noun}</Button>}
    </div>}
  >
    <form id={formId} className="knowledge-dialog-form" noValidate onSubmit={event => {
      event.preventDefault();
      if (valid && !busy) mutation.mutate(name);
    }}>
      <div className="knowledge-dialog-body">
        <InlineMessage tone="info">This value is saved to the shared catalog immediately. It remains available even if you later discard the checklist draft.</InlineMessage>
        {existing ? <InlineMessage tone="info" role="status">“{existing.name}” already exists. Use the existing value to select it without creating a duplicate.</InlineMessage>
          : error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
        <Field id={`${formId}-name`} label="Name" required error={name.length > 80 ? "Use at most 80 characters." : undefined} hint={`Shown in the ${labels.list} dropdown and Excel workbooks.`}>
          {props => <Input {...props} ref={nameRef} value={name} maxLength={80} autoComplete="off" disabled={busy} onChange={event => {
            const nextName = event.target.value;
            reconciliationSequence.current += 1;
            currentNameRef.current = nextName;
            setName(nextName);
            setExisting(null);
            mutation.reset();
          }} />}
        </Field>
      </div>
    </form>
  </ContextPanel>;
}

function cacheOption(queryClient: ReturnType<typeof useQueryClient>, option: KnowledgeQualityControlOptionSummary): void {
  queryClient.setQueryData<KnowledgeQualityControlOptionListResponse>(
    knowledgeQueryKeys.qualityControlOptions(option.kind),
    current => ({ items: current?.items.some(candidate => candidate.id === option.id) ? current.items : [...(current?.items ?? []), option] })
  );
}
