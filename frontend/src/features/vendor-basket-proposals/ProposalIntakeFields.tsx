import { useId, type RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { PROPOSAL_LIMITS, type ProposalIntakeContent } from "./proposalTypes";

export const emptyProposalIntake = (existingParent: boolean): ProposalIntakeContent => ({
  ...(!existingParent ? { basket: { name: "", description: "" } } : {}),
  subBasket: { name: "", description: "" }, mainLines: [{ name: "" }]
});

const normalizeName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
export function normalizedIntake(value: ProposalIntakeContent): ProposalIntakeContent {
  return {
    ...(value.basket ? { basket: { name: normalizeName(value.basket.name), description: value.basket.description?.trim() || null } } : {}),
    subBasket: { name: normalizeName(value.subBasket.name), description: value.subBasket.description?.trim() || null },
    mainLines: value.mainLines.map(line => ({ ...(line.resourceId ? { resourceId: line.resourceId } : {}), name: normalizeName(line.name) }))
  };
}

export function intakeErrors(value: ProposalIntakeContent, complete: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (value.basket && !value.basket.name.trim()) errors.basketName = "Enter a Main Basket name.";
  if (value.basket && complete && !value.basket.description?.trim()) errors.basketDescription = "Describe the Main Basket before sending it for approval.";
  if (!value.subBasket.name.trim()) errors.subBasketName = "Enter a Sub Basket name.";
  if (complete && !value.subBasket.description?.trim()) errors.subBasketDescription = "Describe the Sub Basket before sending it for approval.";
  value.mainLines.forEach((line, index) => { if (!line.name.trim()) errors[`line${index}`] = "Enter a Main Line name or remove this row."; });
  if (complete && !value.mainLines.length) errors.mainLines = "Add at least one Main Line name before sending it for approval.";
  return errors;
}

export function ProposalIntakeFields({ value, onChange, parentName, disabled = false, readOnly = false, errors = {}, firstInputRef }: {
  value: ProposalIntakeContent; onChange: (value: ProposalIntakeContent) => void; parentName?: string;
  disabled?: boolean; readOnly?: boolean; errors?: Record<string, string>; firstInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  return <div className="proposal-intake__fields">
    {value.basket ? <section aria-label="Main Basket details">
      <Field id={`${id}-basket-name`} label="Main Basket name" required error={errors.basketName}>{props => <Input {...props} ref={firstInputRef} readOnly={readOnly} disabled={disabled} maxLength={240} value={value.basket!.name} onChange={event => onChange({ ...value, basket: { ...value.basket!, name: event.target.value } })} />}</Field>
      <Field id={`${id}-basket-description`} label="Main Basket description" hint="Required when sending the request for approval." error={errors.basketDescription}>{props => <Textarea {...props} readOnly={readOnly} disabled={disabled} rows={3} maxLength={4000} value={value.basket!.description ?? ""} onChange={event => onChange({ ...value, basket: { ...value.basket!, description: event.target.value } })} />}</Field>
    </section> : <p className="proposal-intake__parent">Selected Main Basket: <strong>{parentName ?? "Unavailable Main Basket"}</strong></p>}
    <section aria-label="Sub Basket details">
      <Field id={`${id}-sub-name`} label="Sub Basket name" required error={errors.subBasketName}>{props => <Input {...props} ref={!value.basket ? firstInputRef : undefined} readOnly={readOnly} disabled={disabled} maxLength={240} value={value.subBasket.name} onChange={event => onChange({ ...value, subBasket: { ...value.subBasket, name: event.target.value } })} />}</Field>
      <Field id={`${id}-sub-description`} label="Sub Basket description" hint="Required when sending the request for approval." error={errors.subBasketDescription}>{props => <Textarea {...props} readOnly={readOnly} disabled={disabled} rows={3} maxLength={4000} value={value.subBasket.description ?? ""} onChange={event => onChange({ ...value, subBasket: { ...value.subBasket, description: event.target.value } })} />}</Field>
    </section>
    <section aria-label="Main Line names">
      <h3>Main Lines</h3><p>List the work or materials needed within this Sub Basket. Super Admin will configure these Main Lines after approval.</p>
      {value.mainLines.map((line, index) => <div className="proposal-intake__line" key={line.resourceId ?? index}>
        <Field id={`${id}-line-${index}`} label={`Main Line ${index + 1} name`} required error={errors[`line${index}`]}>{props => <Input {...props} readOnly={readOnly} disabled={disabled} maxLength={240} value={line.name} onChange={event => onChange({ ...value, mainLines: value.mainLines.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry) })} />}</Field>
        {!readOnly ? <Button variant="quiet" disabled={disabled} aria-label={`Remove Main Line ${index + 1}`} onClick={() => onChange({ ...value, mainLines: value.mainLines.filter((_, at) => at !== index) })}>Remove</Button> : null}
      </div>)}
      {!value.mainLines.length ? <p>No Main Lines added.</p> : null}
      {errors.mainLines ? <p role="alert">{errors.mainLines}</p> : null}
      {!readOnly ? <Button variant="secondary" disabled={disabled || value.mainLines.length >= PROPOSAL_LIMITS.mainLines} onClick={() => onChange({ ...value, mainLines: [...value.mainLines, { name: "" }] })}>Add Main Line</Button> : null}
    </section>
  </div>;
}
