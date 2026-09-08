import { useId } from "react";
import { Field, Input } from "../../components/ui/Field";
import { formatKnowledgePercentage } from "./knowledgePresentation";
import { parseSimulatorDiscount } from "./knowledgeSimulatorDiscount";

export function KnowledgeSimulatorDiscountField({ value, onChange, maximumBps, attempted, combined = false }: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maximumBps: number | undefined;
  readonly attempted: boolean;
  readonly combined?: boolean;
}) {
  const id = useId();
  const parsed = parseSimulatorDiscount(value, maximumBps);
  const error = parsed.overLimit || attempted ? parsed.error : undefined;
  return <Field id={`${id}-discount`} label="Discount (%)"
    hint={maximumBps === undefined ? "Complete the markup values to see the allowed discount."
      : `Maximum allowed: ${formatKnowledgePercentage(maximumBps)}. Discount reduces the selected markup.${combined ? " Both Labor and Material must stay at or above their minimum markup." : ""}`}
    error={error ? <span role="alert">{error}</span> : undefined}>
    {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64} value={value}
      onChange={(event) => onChange(event.target.value)} />}
  </Field>;
}
