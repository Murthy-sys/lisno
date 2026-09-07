import { useId, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

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
  readonly actions?: ReactNode;
  readonly onChange: (field: keyof KnowledgeModeCalculationDraft, value: string) => void;
}

export function KnowledgeModeCalculationTable({
  value, uomLabel, uomMessage, readOnly, errors = {}, actions, onChange
}: Props) {
  const id = useId();

  function editableField(field: keyof KnowledgeModeCalculationDraft, label: ReactNode, affix?: string, leading = false) {
    return <Field id={`${id}-${field}`} label={label} error={errors[field]}>
      {(props) => <div className="knowledge-mode-calculation__input" data-affix={affix ? leading ? "leading" : "trailing" : undefined}>
        <Input {...props} className="knowledge-mode-calculation__control" inputMode="decimal" autoComplete="off" maxLength={64}
          value={value[field]} disabled={readOnly} onChange={(event) => onChange(field, event.target.value)}
        />
        {affix ? <span className="knowledge-mode-calculation__affix" aria-hidden="true">{affix}</span> : null}
      </div>}
    </Field>;
  }

  return (
    <section className="knowledge-mode-calculation" aria-labelledby={`${id}-title`}>
      <div className="knowledge-mode-calculation__header">
        <h3 id={`${id}-title`}>Calculations</h3>
        {actions}
      </div>
      <div className="knowledge-mode-calculation__groups" role="region" aria-label="Calculation settings">
        <div className="knowledge-mode-calculation__group" role="group" aria-labelledby={`${id}-rate-title`}>
          <h4 id={`${id}-rate-title`}>Rate &amp; quantity</h4>
          <div className="knowledge-mode-calculation__rate-fields">
            {editableField("baseRate", <>Base Rate<span className="sr-only"> (₹)</span></>, "₹", true)}
            <dl className="knowledge-mode-calculation__fixed">
              <dt>UOM</dt>
              <dd aria-describedby={uomMessage ? `${id}-uom-message` : undefined}>
                <span>{uomLabel}</span><LockKeyhole aria-hidden="true" />
              </dd>
            </dl>
            {editableField("lowQuantityLimit", "Low Quantity Limit")}
            <dl className="knowledge-mode-calculation__fixed">
              <dt>Impact</dt>
              <dd><span>10.00%</span><LockKeyhole aria-hidden="true" /></dd>
            </dl>
          </div>
          <p className="knowledge-mode-calculation__note">UOM follows Overview. Impact applies below the quantity limit.</p>
          {uomMessage ? <p id={`${id}-uom-message`} className="knowledge-mode-calculation__hint">{uomMessage}</p> : null}
        </div>
        <div className="knowledge-mode-calculation__group" role="group" aria-labelledby={`${id}-markup-title`}>
          <h4 id={`${id}-markup-title`}>Gross margin markup</h4>
          <div className="knowledge-mode-calculation__markup-fields">
            {editableField("minimumRate", <>Min.<span className="sr-only"> Gross Margin Markup (%)</span></>, "%")}
            {editableField("startingRate", <>Starting<span className="sr-only"> Gross Margin Markup (%)</span></>, "%")}
          </div>
          <p className="knowledge-mode-calculation__note">Markup is added to the revised amount.</p>
        </div>
      </div>
    </section>
  );
}
