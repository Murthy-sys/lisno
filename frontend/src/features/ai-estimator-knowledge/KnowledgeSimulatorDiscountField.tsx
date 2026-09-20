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
  readonly basis?: "in_house" | "markup" | "pmc" | "sub_vendor";
}) {
  const id = useId();
  const parsed = parseSimulatorDiscount(value, maximumBps, basis);
  const error = attempted ? parsed.error : undefined;
  return <Field id={`${id}-discount`} label="Discount (%)"
    hint={basis === "sub_vendor" ? "Discount applies to the selling price before discount. Enter your custom percentage."
      : basis === "pmc" ? "Discount applies only to the PMC charge. Enter your custom percentage."
      : maximumBps === undefined ? "The calculation will return the amount-aware maximum selling-price discount."
      : `Maximum selling-price discount: ${formatKnowledgePercentage(maximumBps)}. Discount applies to the In-house selling price and preserves ${combined ? "both Labor and Material" : "the"} minimum Gross Margin.`}
    error={error ? <span role="alert">{error}</span> : undefined}>
    {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64} value={value}
      onChange={(event) => onChange(event.target.value)} />}
  </Field>;
}
