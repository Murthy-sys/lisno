import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { KnowledgeModeCalculationTable, type KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { KnowledgeModeCalculationSimulator } from "./KnowledgeModeCalculationSimulator";
import { modeCalculationDraft, parseModeCalculationDraft, type ModeCalculationSettings } from "./knowledgeModeCalculation";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

export interface KnowledgeModeCalculationUom {
  readonly scopeKey: string;
  readonly id?: string;
  readonly label: string;
  readonly decimalScale?: number;
  readonly message?: string;
  readonly onRetry?: () => void;
}

interface Props {
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
}

export function KnowledgeModeCalculationEditor({ value, uom, readOnly, validationAttempt, issues, onChange, onDirty, onValidationChange, active = true, contextLabel, issuePath = "modeCalculation" }: Props) {
  const [draft, setDraft] = useState(() => modeCalculationDraft(value));
  const [touched, setTouched] = useState(value != null);
  const [simulator, setSimulator] = useState<{ scopeKey: string; initialDraft: KnowledgeModeCalculationDraft } | null>(null);
  const previousValue = useRef(JSON.stringify(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = uom.decimalScale ?? 6;
  const parsed = parseModeCalculationDraft(draft, scale);
  const valid = !touched || Boolean(parsed.settings);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized !== previousValue.current) {
      setDraft(modeCalculationDraft(value));
      setTouched(value != null);
      previousValue.current = serialized;
    }
  }, [value]);
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
    setTouched(true);
    onDirty();
    const settings = parseModeCalculationDraft(next, scale).settings;
    if (settings) {
      previousValue.current = JSON.stringify(settings);
      onChange(settings);
    }
  }

  return <div ref={rootRef}>
    {active ? <KnowledgeModeCalculationTable value={draft} uomLabel={uom.label} uomMessage={uom.message}
      title={contextLabel ? `${contextLabel} calculations` : undefined}
      readOnly={readOnly} errors={errors} onChange={change}
      actions={<div className="knowledge-mode-calculation__actions">
        {uom.onRetry ? <Button variant="secondary" onClick={uom.onRetry}>Retry UOM</Button> : null}
        <Button variant="secondary" onClick={() => setSimulator({ scopeKey: uom.scopeKey, initialDraft: { ...draft } })}>
          Test calculations
        </Button>
      </div>}
    /> : null}
    {active && simulator?.scopeKey === uom.scopeKey ? <KnowledgeModeCalculationSimulator
      key={`${uom.scopeKey}:${uom.id ?? "missing"}:${uom.decimalScale ?? "missing"}`}
      initialDraft={simulator.initialDraft} uom={uom} contextLabel={contextLabel} onClose={() => setSimulator(null)}
    /> : null}
  </div>;
}
