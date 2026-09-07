import { useId } from "react";

import { Field, Input } from "../../components/ui/Field";

export interface KnowledgeModeCalculationDraft {
  readonly baseRate: string;
  readonly lowQuantityLimit: string;
  readonly minimumRate: string;
  readonly startingRate: string;
}

export interface KnowledgeModeCalculationResult {
  readonly revisedUnitRatePaise: number;
  readonly revisedAmountPaise: number;
  readonly totalPaise: number;
  readonly appliedImpactBps: number;
}

interface Props {
  readonly value: KnowledgeModeCalculationDraft;
  readonly uomLabel: string;
  readonly uomMessage?: string;
  readonly readOnly: boolean;
  readonly errors?: Partial<Record<keyof KnowledgeModeCalculationDraft, string>>;
  readonly onChange: (field: keyof KnowledgeModeCalculationDraft, value: string) => void;
}

export function KnowledgeModeCalculationTable({
  value, uomLabel, uomMessage, readOnly, errors = {}, onChange
}: Props) {
  const id = useId();

  function editableCell(field: keyof KnowledgeModeCalculationDraft, label: string) {
    return <Field id={`${id}-${field}`} label={<span className="sr-only">{label}</span>} error={errors[field]}>
      {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64}
        value={value[field]} disabled={readOnly} onChange={(event) => onChange(field, event.target.value)}
      />}
    </Field>;
  }

  return (
    <section className="knowledge-mode-calculation" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Calculations</h3>
      <div className="knowledge-mode-calculation__table-wrap" role="region" aria-label="Calculation settings" tabIndex={0}>
        <table>
          <thead><tr>
            <th scope="col">Base Rate (₹)</th>
            <th scope="col">UOM</th>
            <th scope="col">Low Quantity Limit</th>
            <th scope="col">Impact</th>
            <th scope="col">Min. Gross Margin Markup (%)</th>
            <th scope="col">Starting Gross Margin Markup (%)</th>
          </tr></thead>
          <tbody><tr>
            <td>{editableCell("baseRate", "Base Rate (₹)")}</td>
            <td>{uomLabel}</td>
            <td>{editableCell("lowQuantityLimit", "Low Quantity Limit")}</td>
            <td>10.00%</td>
            <td>{editableCell("minimumRate", "Min. Gross Margin Markup (%)")}</td>
            <td>{editableCell("startingRate", "Starting Gross Margin Markup (%)")}</td>
          </tr></tbody>
        </table>
      </div>
      {uomMessage ? <p className="knowledge-mode-calculation__hint">{uomMessage}</p> : null}
    </section>
  );
}
