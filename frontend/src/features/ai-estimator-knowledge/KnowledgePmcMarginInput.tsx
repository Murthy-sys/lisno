import { useEffect, useId, useRef, useState } from "react";

import { Field, Input } from "../../components/ui/Field";
import { formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

function marginText(value: KnowledgeJsonValue | undefined): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return formatPaiseForRupeeInput(value);
  return typeof value === "string" ? value : "";
}

export function KnowledgePmcMarginInput({ value, readOnly, error, onChange }: {
  value: KnowledgeJsonValue | undefined;
  readOnly: boolean;
  error?: string;
  onChange: (value: KnowledgeJsonValue) => void;
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

  return <Field id={`${id}-pmc-margin`} className="knowledge-pmc-margin"
    label="PMC Margin" hint="Allowed: 10%–20%" error={error}>
    {(controlProps) => <div className="knowledge-pmc-margin__control">
      <Input {...controlProps} type="number" inputMode="decimal" min={10} max={20} step="0.01"
      value={text} disabled={readOnly} placeholder="10–20"
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
