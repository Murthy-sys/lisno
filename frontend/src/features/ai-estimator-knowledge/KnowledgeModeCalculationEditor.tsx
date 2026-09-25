import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { KnowledgeModeCalculationTable, type KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { KnowledgeModeCalculationSimulator } from "./KnowledgeModeCalculationSimulator";
import { modeCalculationDraft, parseModeCalculationDraft, type ModeCalculationScope, type ModeCalculationSettings } from "./knowledgeModeCalculation";
import type { KnowledgePendingCalculation } from "./knowledgeModePendingChanges";
import type { KnowledgeJsonValue } from "./knowledgeTypes";
import "./knowledge-mode-calculation-reference.css";

export interface KnowledgeModeCalculationUom {
  readonly scopeKey: string;
  readonly id?: string;
  readonly label: string;
  readonly decimalScale?: number;
  readonly message?: string;
  readonly onRetry?: () => void;
}

interface Props {
  readonly scope?: ModeCalculationScope;
  readonly pmcMarginBps?: KnowledgeJsonValue;
  readonly pmcMinimumMarginBps?: KnowledgeJsonValue;
  readonly subVendorMarginBps?: KnowledgeJsonValue;
  readonly subVendorMinimumMarginBps?: KnowledgeJsonValue;
  readonly marginControl?: ReactNode;
  readonly active?: boolean;
  readonly contextLabel?: string;
  readonly issuePath?: string;
  readonly value: KnowledgeJsonValue | undefined;
  readonly uom: KnowledgeModeCalculationUom;
  readonly readOnly: boolean;
  readonly validationAttempt: number;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
  readonly onChange: (settings: ModeCalculationSettings) => void;
  readonly onDirty: () => void;
  readonly onValidationChange: (valid: boolean) => void;
  readonly pendingSaveVersion?: number;
  readonly onPendingInputChange?: (pending: KnowledgePendingCalculation | null) => void;
}

export function KnowledgeModeCalculationEditor({ value, uom, readOnly, validationAttempt, issues, onChange, onDirty, onValidationChange, onPendingInputChange, pendingSaveVersion = 0, active = true, contextLabel, issuePath = "modeCalculation", scope, pmcMarginBps, pmcMinimumMarginBps, subVendorMarginBps, subVendorMinimumMarginBps, marginControl }: Props) {
  const [draft, setDraft] = useState(() => modeCalculationDraft(value));
  const [locallyEdited, setLocallyEdited] = useState(false);
  const baselineDraft = useRef(modeCalculationDraft(value));
  const [touched, setTouched] = useState(value != null);
  const [simulator, setSimulator] = useState<{ scopeKey: string; initialDraft: KnowledgeModeCalculationDraft; pmcMarginBps?: KnowledgeJsonValue; pmcMinimumMarginBps?: KnowledgeJsonValue; subVendorMarginBps?: KnowledgeJsonValue; subVendorMinimumMarginBps?: KnowledgeJsonValue } | null>(null);
  const previousValue = useRef(JSON.stringify(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = uom.decimalScale ?? 6;
  const enforceGrossMargin = scope !== "pmc" && scope !== "sub_vendor";
  const parsed = parseModeCalculationDraft(draft, scale, enforceGrossMargin);
  const valid = !touched || Boolean(parsed.settings);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized !== previousValue.current) {
      setDraft(modeCalculationDraft(value));
      setLocallyEdited(false);
      baselineDraft.current = modeCalculationDraft(value);
      setTouched(value != null);
      previousValue.current = serialized;
    }
  }, [value]);
  useEffect(() => {
    setLocallyEdited(false);
    baselineDraft.current = modeCalculationDraft(value);
  }, [pendingSaveVersion]);
  const pendingCallbackRef = useRef(onPendingInputChange);
  pendingCallbackRef.current = onPendingInputChange;
  const invalidFieldsKey = Object.keys(parsed.errors).join(",");
  useEffect(() => { pendingCallbackRef.current?.(locallyEdited ? { draft, baselineDraft: baselineDraft.current, invalidFields: Object.keys(parsed.errors) as (keyof KnowledgeModeCalculationDraft)[] } : null); }, [draft, locallyEdited, invalidFieldsKey]);
  useEffect(() => () => pendingCallbackRef.current?.(null), []);
  useEffect(() => onValidationChange(valid), [onValidationChange, valid]);
  useEffect(() => { if (!active) setSimulator(null); }, [active]);
  useEffect(() => {
    if (active && validationAttempt > 0) rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [active, validationAttempt]);

  const errors = { ...(touched ? parsed.errors : {}) };
  const paths = { baseRate: "baseRatePaise", lowQuantityLimit: "lowQuantityLimit", impactRate: "impactBps", minimumRate: "minimumMarkupBps", startingRate: "startingMarkupBps" } as const;
  for (const [field, path] of Object.entries(paths)) {
    const error = issues.find((issue) => issue.path === `${issuePath}.${path}`)?.message;
    if (error) errors[field as keyof KnowledgeModeCalculationDraft] = error;
  }

  function change(field: keyof KnowledgeModeCalculationDraft, text: string) {
    if (readOnly) return;
    const next = { ...draft, [field]: text };
    setDraft(next);
    setLocallyEdited(true);
    setTouched(true);
    onDirty();
    const settings = parseModeCalculationDraft(next, scale, enforceGrossMargin).settings;
    if (settings) {
      previousValue.current = JSON.stringify(settings);
      onChange(settings);
    }
  }

  return <div ref={rootRef} className="knowledge-mode-calculation-editor">
    {active ? <KnowledgeModeCalculationTable value={draft} uomLabel={uom.label} uomMessage={uom.message}
      scope={scope} marginControl={marginControl} showGuidanceIcon
      title={contextLabel ? `${contextLabel} calculations` : undefined}
      readOnly={readOnly} errors={errors} onChange={change}
      actions={<div className="knowledge-mode-calculation__actions">
        {uom.onRetry ? <Button variant="secondary" onClick={uom.onRetry}>Retry UOM</Button> : null}
        <Button variant="secondary" leadingIcon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M8 6.5h8M8 10.5h1m6 0h1M8 14h1m6 0h1M8 17.5h1m3-7h1m-1 3.5h1m2 0v3.5m-3 0h1" /></svg>}
          onClick={() => setSimulator({ scopeKey: uom.scopeKey, initialDraft: { ...draft }, pmcMarginBps, pmcMinimumMarginBps, subVendorMarginBps, subVendorMinimumMarginBps })}>
          Test calculations
        </Button>
      </div>}
    /> : null}
    {active && simulator?.scopeKey === uom.scopeKey ? <KnowledgeModeCalculationSimulator
      key={`${scope ?? "generic"}:${uom.scopeKey}:${uom.id ?? "missing"}:${uom.decimalScale ?? "missing"}`}
      initialDraft={simulator.initialDraft} scope={scope} pmcMarginBps={simulator.pmcMarginBps} pmcMinimumMarginBps={simulator.pmcMinimumMarginBps} subVendorMarginBps={simulator.subVendorMarginBps} subVendorMinimumMarginBps={simulator.subVendorMinimumMarginBps} uom={uom} contextLabel={contextLabel} onClose={() => setSimulator(null)}
    /> : null}
  </div>;
}
