import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Field, Input } from "../../components/ui/Field";
import { formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

function marginText(value: KnowledgeJsonValue | undefined): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return formatPaiseForRupeeInput(value);
  return typeof value === "string" ? value : "";
}

interface MarginInputProps {
  value: KnowledgeJsonValue | undefined;
  readOnly: boolean;
  error?: string;
  onChange: (value: KnowledgeJsonValue) => void;
}

export function KnowledgePmcMarginInput(props: MarginInputProps) {
  return <MarginInput {...props} label="PMC Margin" className="knowledge-pmc-margin" hint="Allowed: 10%–20%" min={10} max={20} step={5} placeholder="10–20" />;
}

export function KnowledgeSubVendorMarginRange({ minimum, maximum, readOnly, errors, onChange, onFieldRef }: {
  minimum: KnowledgeJsonValue | undefined;
  maximum: KnowledgeJsonValue | undefined;
  readOnly: boolean;
  errors: { minimum?: string; maximum?: string };
  onChange: (field: "minimum" | "maximum", value: KnowledgeJsonValue) => void;
  onFieldRef: (field: "minimum" | "maximum", node: HTMLDivElement | null) => void;
}) {
  const hintId = `${useId()}-lisno-margin-hint`;
  return <div className="knowledge-lisno-margin" role="group" aria-label="Lisno Margin">
    <div className="knowledge-lisno-margin__fields">
      {(["minimum", "maximum"] as const).map((field) => <div key={field} ref={(node) => onFieldRef(field, node)}>
        <MarginInput value={field === "minimum" ? minimum : maximum}
          readOnly={readOnly} error={errors[field]} min={0} max={95} step={5} describedBy={hintId}
          label={<>{field === "minimum" ? "Min." : "Max."}<span className="sr-only"> Lisno Margin (%)</span></>}
          onChange={(value) => onChange(field, value)} />
      </div>)}
    </div>
    <p className="ui-field__hint" id={hintId}>Multiples of 5% · Min. ≤ Max.</p>
  </div>;
}

function MarginInput({ value, readOnly, error, onChange, label, className, hint, describedBy, min, max, step, placeholder }: MarginInputProps & {
  label: ReactNode;
  className?: string;
  hint?: string;
  describedBy?: string;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => marginText(value));
  const currentValue = useRef(value);
  useEffect(() => {
    if (!Object.is(value, currentValue.current)) {
      currentValue.current = value;
      setText(marginText(value));
    }
  }, [value]);

  return <Field id={`${id}-margin`} className={className}
    label={label} hint={hint} describedBy={describedBy} error={error}>
    {(controlProps) => <div className="knowledge-pmc-margin__control">
      <Input {...controlProps} type="number" inputMode="decimal" min={min} max={max} step={step}
      value={text} disabled={readOnly} placeholder={placeholder}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        // Percentages and currency both use exact hundredths; persist integer basis points.
        const parsed = parseRupeeInputToPaise(nextText);
        const nextValue = event.target.validity.badInput ? "Invalid number"
          : nextText === "" ? null : parsed.status === "valid" ? parsed.paise : nextText;
        currentValue.current = nextValue;
        onChange(nextValue);
      }} />
      <span className="knowledge-pmc-margin__suffix" aria-hidden="true">%</span>
    </div>}
  </Field>;
}
