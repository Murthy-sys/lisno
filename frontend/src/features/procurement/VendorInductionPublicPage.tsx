import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import type { VendorInductionAnswer, VendorInductionPublicInspection, VendorInductionPublicSubmitInput, VendorInductionQuestion, VendorInductionSubmissionReceipt } from "../../../../shared/knowledge/vendorInduction";
import { vendorInductionQuestionVisible } from "../../../../shared/knowledge/vendorInduction";
import { procurementRequestKey } from "./procurementPresentation";
import { inspectPublicVendorInduction, submitPublicVendorInduction } from "./vendorInductionApi";
import { consumeVendorInductionToken, releaseVendorInductionToken } from "./vendorInductionTokenVault";
import "./vendorKpi.css";
import "./vendorInduction.css";

const CLAIMANT = Symbol("vendor-induction-public-page");
type Inspection = { state: "checking" } | { state: "unavailable" } | { state: "ready"; detail: VendorInductionPublicInspection };
type Values = Record<string, string | readonly string[]>;
const unavailableError = (error: unknown) => error instanceof ApiError && [400, 401, 403, 404, 409, 410].includes(error.status);
const recorded = (value: string) => value.trim() || "Not recorded";

function answersFromValues(questions: readonly VendorInductionQuestion[], values: Values): VendorInductionAnswer[] {
  const answers: VendorInductionAnswer[] = [];
  for (const question of questions) {
    if (!question.enabled || !vendorInductionQuestionVisible(question, answers)) continue;
    const value = values[question.id];
    if (value === undefined || typeof value === "string" && !value.trim() || Array.isArray(value) && value.length === 0) continue;
    if (question.type === "yes_no") answers.push({ questionId: question.id, value: value === "yes" });
    else if (question.type === "number") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) answers.push({ questionId: question.id, value: parsed });
    } else if (question.type === "multi_choice" && Array.isArray(value)) answers.push({ questionId: question.id, value });
    else if (typeof value === "string") answers.push({ questionId: question.id, value: value.trim() });
  }
  return answers;
}

function questionError(question: VendorInductionQuestion, value: Values[string] | undefined): string | null {
  const empty = value === undefined || typeof value === "string" && !value.trim() || Array.isArray(value) && value.length === 0;
  if (empty) return question.required ? "Answer this question before continuing." : null;
  if (question.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "Enter a non-negative number.";
    if (question.min !== null && number < question.min) return `Enter at least ${question.min}.`;
    if (question.max !== null && number > question.max) return `Enter no more than ${question.max}.`;
  }
  if (question.type === "single_choice" && !question.options.some((option) => option.id === value)) return "Select a listed option.";
  if (question.type === "multi_choice" && (!Array.isArray(value) || value.some((id) => !question.options.some((option) => option.id === id)))) return "Select listed options only.";
  return null;
}

function QuestionInput({ question, value, error, onChange }: { question: VendorInductionQuestion; value: Values[string] | undefined; error?: string; onChange: (value: Values[string]) => void }) {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  const selected = Array.isArray(value) ? value : [];
  const hint = question.helpText || (question.type === "number" ? [question.min !== null ? `Minimum ${question.min}` : null, question.max !== null ? `Maximum ${question.max}` : null, question.unit].filter(Boolean).join(" · ") : undefined);
  if (question.type === "yes_no" || question.type === "single_choice" || question.type === "multi_choice") {
    const options = question.type === "yes_no" ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : question.options;
    return <fieldset className="vendor-induction__answer-field" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}><legend>{question.prompt}{question.required ? <span aria-hidden="true"> *</span> : null}</legend>{hint ? <p id={`${id}-hint`}>{hint}</p> : null}<div className="vendor-induction__choices">{options.map((option) => <label key={option.id}>{question.type === "multi_choice" ? <Checkbox checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((entry) => entry !== option.id))} /> : <input type="radio" name={id} value={option.id} checked={text === option.id} onChange={() => onChange(option.id)} />}{option.label}</label>)}</div>{error ? <p className="vendor-induction__field-error" id={`${id}-error`}>{error}</p> : null}</fieldset>;
  }
  return <Field id={id} label={question.prompt} hint={hint} required={question.required} error={error}>{(props) => question.type === "paragraph" ? <Textarea {...props} rows={4} maxLength={4000} value={text} onChange={(event) => onChange(event.target.value)} /> : <Input {...props} type={question.type === "number" ? "number" : "text"} min={question.type === "number" ? 0 : undefined} step={question.type === "number" ? "any" : undefined} maxLength={question.type === "short_text" ? 240 : undefined} value={text} onChange={(event) => onChange(event.target.value)} />}</Field>;
}

function answerText(question: VendorInductionQuestion, answer: VendorInductionAnswer): string {
  if (typeof answer.value === "boolean") return answer.value ? "Yes" : "No";
  if (typeof answer.value === "number") return `${answer.value}${question.unit ? ` ${question.unit}` : ""}`;
  if (Array.isArray(answer.value)) return answer.value.map((id) => question.options.find((option) => option.id === id)?.label ?? "Unavailable option").join(", ");
  if (question.type === "single_choice") return question.options.find((option) => option.id === answer.value)?.label ?? "Unavailable option";
  return String(answer.value);
}

export function VendorInductionPublicPage() {
  const claimed = useRef(false);
  const token = useRef<string | null>(null);
  if (!claimed.current) { claimed.current = true; token.current = consumeVendorInductionToken(CLAIMANT); }
  const inspectPromise = useRef<Promise<VendorInductionPublicInspection> | null>(null);
  const command = useRef<VendorInductionPublicSubmitInput | null>(null);
  const [inspection, setInspection] = useState<Inspection>({ state: "checking" });
  const [receipt, setReceipt] = useState<VendorInductionSubmissionReceipt | null>(null);
  const [values, setValues] = useState<Values>({});
  const [reviewing, setReviewing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    releaseVendorInductionToken(CLAIMANT);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = robots?.content;
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = "noindex,nofollow,noarchive";
    return () => { if (previous === undefined) robots?.remove(); else if (robots) robots.content = previous; };
  }, []);
  useEffect(() => {
    if (!token.current) { setInspection({ state: "unavailable" }); return; }
    inspectPromise.current ??= inspectPublicVendorInduction(token.current);
    let active = true;
    void inspectPromise.current.then(
      (detail) => { if (active) setInspection({ state: "ready", detail }); },
      () => { if (active) { token.current = null; setInspection({ state: "unavailable" }); } }
    );
    return () => { active = false; };
  }, []);

  const questions = inspection.state === "ready" ? inspection.detail.questionnaire.questions.filter((question) => question.enabled) : [];
  const answers = answersFromValues(questions, values);
  const visible = questions.filter((question) => vendorInductionQuestionVisible(question, answers));
  const invalid = visible.find((question) => questionError(question, values[question.id]));

  async function submit() {
    if (inspection.state !== "ready" || !token.current || busy || invalid) return;
    if (!command.current || JSON.stringify(command.current.answers) !== JSON.stringify(answers)) command.current = { token: token.current, idempotencyKey: procurementRequestKey(), answers };
    setBusy(true); setError("");
    try {
      const saved = await submitPublicVendorInduction(command.current);
      token.current = null; command.current = null; setReceipt(saved);
    } catch (cause) {
      if (unavailableError(cause)) { token.current = null; command.current = null; setInspection({ state: "unavailable" }); }
      else setError("Your answers could not be confirmed. Retry to check or complete this submission.");
    } finally { setBusy(false); }
  }

  return <main className="vendor-kpi vendor-kpi--public vendor-induction vendor-induction--public" aria-labelledby="vendor-induction-public-title">
    <header className="vendor-kpi__public-header"><p className="vendor-kpi__eyebrow">Lisno · Vendor induction</p><h1 id="vendor-induction-public-title">Vendor induction</h1><p>Answer the questions requested by Procurement. Your submission will be reviewed before induction is approved.</p></header>
    {receipt ? <section className="vendor-kpi__receipt" role="status"><h2>Answers submitted</h2><p>Procurement has received your answers for review. They will contact you if anything needs to change.</p><p>Submitted {new Date(receipt.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p></section> : inspection.state === "checking" ? <PageState state="loading" message="Checking your induction link…" /> : inspection.state === "unavailable" ? <PageState state="error" message="This induction link is unavailable or has already been used. Contact your Procurement representative for a new request." /> : <>
      <section className="vendor-kpi__public-identity" aria-label="Vendor details"><div><span>Vendor name</span><strong>{inspection.detail.vendor.name}</strong></div><dl><div><dt>Vendor type</dt><dd>{inspection.detail.vendor.vendorType === "execution" ? "Execution vendor" : "Supplier"}</dd></div><div><dt>Work profile</dt><dd>{recorded(inspection.detail.vendor.workProfile)}</dd></div><div><dt>Representative</dt><dd>{recorded(inspection.detail.vendor.representativeName)}</dd></div><div><dt>Position</dt><dd>{recorded(inspection.detail.vendor.representativePosition)}</dd></div></dl></section>
      {inspection.detail.changeNote ? <InlineMessage tone="warning">Procurement requested changes: {inspection.detail.changeNote}</InlineMessage> : null}
      <p className="vendor-kpi__meta">Questionnaire version {inspection.detail.questionnaire.version}. This link expires {new Date(inspection.detail.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} and can be used once.</p>
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {reviewing ? <section className="vendor-induction__review" aria-label="Review answers"><h2>Review your answers</h2><p>Submit when the answers are complete. Procurement will review them before induction is approved.</p><dl>{visible.map((question) => <div key={question.id}><dt>{question.prompt}</dt><dd>{answers.find((answer) => answer.questionId === question.id) ? answerText(question, answers.find((answer) => answer.questionId === question.id)!) : "Not answered"}</dd></div>)}</dl><div className="vendor-induction__actions"><Button variant="secondary" disabled={busy} onClick={() => setReviewing(false)}>Edit answers</Button><Button busy={busy} onClick={() => void submit()}>Submit answers</Button></div></section> : <form className="vendor-induction__form" aria-label="Vendor induction questions" onSubmit={(event) => { event.preventDefault(); setAttempted(true); if (!invalid) { setReviewing(true); setError(""); } }} noValidate>
        {visible.map((question, index) => <section className="vendor-induction__public-question" key={question.id}><span className="vendor-induction__question-number">{index + 1} / {visible.length} · {question.section}</span><QuestionInput question={question} value={values[question.id]} error={attempted ? questionError(question, values[question.id]) ?? undefined : undefined} onChange={(value) => setValues((current) => ({ ...current, [question.id]: value }))} /></section>)}
        {attempted && invalid ? <InlineMessage tone="error">Please complete the highlighted questions before reviewing your answers.</InlineMessage> : null}
        <Button type="submit">Review answers</Button>
      </form>}
    </>}
  </main>;
}
