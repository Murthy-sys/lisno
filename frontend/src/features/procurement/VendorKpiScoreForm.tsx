import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type {
  VendorKpiAssessment,
  VendorKpiCategoryKey,
  VendorKpiCategoryScore,
  VendorKpiVendorType
} from "../../../../shared/knowledge/vendorKpi";
import { formatVendorKpiScore, validateVendorKpiScores, vendorKpiCategories } from "./vendorKpiPresentation";

type Draft = Partial<Record<VendorKpiCategoryKey, string>>;

export function VendorKpiAssessmentView({ title, assessment, type }: {
  title: string; assessment: VendorKpiAssessment | null; type: VendorKpiVendorType;
}) {
  const scores = new Map(assessment?.scores.map(({ key, score }) => [key, score]) ?? []);
  return <section className="vendor-kpi__assessment" aria-label={title}>
    <div className="vendor-kpi__section-heading"><h2>{title}</h2><strong>{assessment ? formatVendorKpiScore(assessment.averageScoreBps) : "Not submitted"}</strong></div>
    {assessment ? <><dl className="vendor-kpi__score-list">{vendorKpiCategories(type).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{scores.get(key) ?? "—"}<span className="sr-only"> out of 100</span></dd></div>)}</dl><p className="vendor-kpi__meta">Saved {new Date(assessment.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{assessment.revision > 1 ? ` · Revision ${assessment.revision}` : ""}</p>{assessment.comment ? <p className="vendor-kpi__comment">{assessment.comment}</p> : null}</> : <p className="vendor-kpi__muted">No assessment has been saved for this rubric.</p>}
  </section>;
}

export function VendorKpiScoreForm({ title, type, initial, submitLabel, busy, error, onSave }: {
  title: string;
  type: VendorKpiVendorType;
  initial?: VendorKpiAssessment | null;
  submitLabel: string;
  busy: boolean;
  error?: string;
  onSave: (values: { scores: readonly VendorKpiCategoryScore[]; comment: string | null }) => Promise<void>;
}) {
  const id = useId();
  const [values, setValues] = useState<Draft>(() => Object.fromEntries(initial?.scores.map(({ key, score }) => [key, String(score)]) ?? []) as Draft);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [errors, setErrors] = useState<Draft>({});
  const inputs = useRef<Partial<Record<VendorKpiCategoryKey, HTMLInputElement | null>>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validateVendorKpiScores(type, values);
    setErrors(result.errors);
    if (!result.valid) {
      const first = vendorKpiCategories(type).find(({ key }) => result.errors[key]);
      if (first) inputs.current[first.key]?.focus();
      return;
    }
    await onSave({ scores: result.scores, comment: comment.trim() || null });
  }

  return <form className="vendor-kpi__assessment vendor-kpi__form" onSubmit={(event) => void submit(event)} noValidate aria-label={title}>
    <div className="vendor-kpi__section-heading"><h2>{title}</h2><span>Rate each category from 0 to 100</span></div>
    <div className="vendor-kpi__fields">{vendorKpiCategories(type).map(({ key, label }) => <Field key={key} id={`${id}-${key}`} label={label} required error={errors[key]}>
      {(props) => <Input {...props} ref={(element) => { inputs.current[key] = element; }} type="number" inputMode="numeric" min={0} max={100} step={1} value={values[key] ?? ""} disabled={busy} onChange={(event) => { setValues((current) => ({ ...current, [key]: event.target.value })); setErrors((current) => ({ ...current, [key]: undefined })); }} />}
    </Field>)}</div>
    <Field id={`${id}-comment`} label="Comments" hint="Optional; up to 1,000 characters.">{(props) => <Textarea {...props} value={comment} maxLength={1000} disabled={busy} onChange={(event) => setComment(event.target.value)} />}</Field>
    {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
    <Button type="submit" busy={busy}>{submitLabel}</Button>
  </form>;
}
