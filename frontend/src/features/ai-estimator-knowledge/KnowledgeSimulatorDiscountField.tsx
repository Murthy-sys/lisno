import { useId } from "react";
import { Field, Input } from "../../components/ui/Field";
import { formatKnowledgePercentage } from "./knowledgePresentation";
import { parseSimulatorDiscount } from "./knowledgeSimulatorDiscount";

export function KnowledgeSimulatorDiscountField({ value, onChange, maximumBps, attempted, combined = false, basis = "markup" }: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maximumBps: number | undefined;
  readonly attempted: boolean;
  readonly combined?: boolean;
  readonly basis?: "markup" | "pmc" | "sub_vendor";
}) {
  const id = useId();
  const parsed = parseSimulatorDiscount(value, maximumBps, basis);
  const error = attempted ? parsed.error : undefined;
  return <Field id={`${id}-discount`} label="Discount (%)"
    hint={basis === "sub_vendor" ? "Discount applies to the selling price before discount. Enter your custom percentage."
      : basis === "pmc" ? "Discount applies only to the PMC charge. Enter your custom percentage."
      : maximumBps === undefined ? "Complete the markup values to see the allowed discount."
      : `Maximum allowed: ${formatKnowledgePercentage(maximumBps)}. Discount reduces the selected markup.${combined ? " Both Labor and Material must stay at or above their minimum markup." : ""}`}
    error={error ? <span role="alert">{error}</span> : undefined}>
    {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64} value={value}
      onChange={(event) => onChange(event.target.value)} />}
  </Field>;
}
