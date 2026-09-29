import { useId } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "../../components/ui/Field";
import type { VendorInductionQuestion } from "../../../../shared/knowledge/vendorInduction";
import { answerTypeLabels, inductionId, newQuestion } from "./vendorInductionQuestions";

type Question = VendorInductionQuestion;
const choiceType = (type: Question["type"]) => type === "single_choice" || type === "multi_choice";

export function VendorInductionQuestionEditor({ questions, onChange, disabled = false }: {
  questions: readonly Question[];
  onChange: (questions: Question[]) => void;
  disabled?: boolean;
}) {
  const prefix = useId();
  function update(index: number, value: Question) { onChange(questions.map((question, current) => current === index ? value : question)); }
  function move(index: number, shift: number) {
    const next = [...questions]; const moved = next.splice(index, 1)[0];
    next.splice(index + shift, 0, moved); onChange(next);
  }
  function duplicate(index: number) {
    const source = questions[index]; const copy = { ...source, id: inductionId(), key: `${source.key.slice(0, 50)}_copy_${inductionId().replaceAll("-", "").slice(0, 5)}` };
    const next = [...questions]; next.splice(index + 1, 0, copy); onChange(next);
  }
  return <div className="vendor-induction__questions">
    <div className="vendor-induction__section-heading"><div><h3>Draft questions</h3><p>Only enabled questions appear on the form sent to this vendor.</p></div><Button variant="secondary" disabled={disabled || questions.length >= 100} onClick={() => onChange([...questions, newQuestion(questions.at(-1)?.section)])}>Add question</Button></div>
    {questions.length === 0 ? <p className="vendor-induction__empty">No questions yet. Add one manually, start from the suggested set, or import a workbook.</p> : null}
    {questions.map((question, index) => {
      const id = `${prefix}-${question.id}`;
      const prior = questions.slice(0, index).filter((entry) => entry.enabled && ["yes_no", "single_choice", "multi_choice"].includes(entry.type));
      const parent = prior.find((entry) => entry.id === question.showIf?.questionId);
      const conditionOptions = parent?.type === "yes_no" ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : parent?.options ?? [];
      return <article className={`vendor-induction__question-editor${question.enabled ? "" : " vendor-induction__question-editor--disabled"}`} key={question.id} aria-label={`Question ${index + 1}`}>
        <div className="vendor-induction__question-top"><strong>Question {index + 1}</strong><div className="vendor-induction__question-actions">
          <Button variant="quiet" size="compact" disabled={disabled || index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => move(index, -1)}>Move up</Button>
          <Button variant="quiet" size="compact" disabled={disabled || index === questions.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => move(index, 1)}>Move down</Button>
          <Button variant="quiet" size="compact" disabled={disabled} aria-label={`Duplicate question ${index + 1}`} onClick={() => duplicate(index)}>Duplicate</Button>
          <Button variant="quiet" size="compact" disabled={disabled} aria-label={`Remove question ${index + 1}`} onClick={() => onChange(questions.filter((_, current) => current !== index))}>Remove</Button>
        </div></div>
        <div className="vendor-induction__editor-grid">
          <Field id={`${id}-section`} label="Section" required>{(props) => <Input {...props} disabled={disabled} maxLength={80} value={question.section} onChange={(event) => update(index, { ...question, section: event.target.value })} />}</Field>
          <Field id={`${id}-key`} label="Question key" hint="Stable reference for answers and exports" required>{(props) => <Input {...props} disabled={disabled} maxLength={64} value={question.key} onChange={(event) => update(index, { ...question, key: event.target.value.toLowerCase().replace(/[^a-z0-9_]+/gu, "_") })} />}</Field>
          <Field id={`${id}-prompt`} label="Question" className="vendor-induction__editor-wide" required>{(props) => <Textarea {...props} disabled={disabled} rows={2} maxLength={500} value={question.prompt} onChange={(event) => update(index, { ...question, prompt: event.target.value })} />}</Field>
          <Field id={`${id}-help`} label="Helpful note" className="vendor-induction__editor-wide">{(props) => <Input {...props} disabled={disabled} maxLength={500} value={question.helpText ?? ""} onChange={(event) => update(index, { ...question, helpText: event.target.value || null })} />}</Field>
          <Field id={`${id}-type`} label="Answer type">{(props) => <Select {...props} disabled={disabled} value={question.type} onChange={(event) => {
            const type = event.target.value as Question["type"];
            update(index, { ...question, type, options: choiceType(type) ? question.options.length ? question.options : [{ id: inductionId(), label: "" }, { id: inductionId(), label: "" }] : [], unit: type === "number" ? question.unit : null, min: type === "number" ? question.min : null, max: type === "number" ? question.max : null });
          }}>{Object.entries(answerTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</Field>
          <div className="vendor-induction__toggles"><label><Checkbox disabled={disabled} checked={question.required} onChange={(event) => update(index, { ...question, required: event.target.checked })} /> Required</label><label><Checkbox disabled={disabled} checked={question.enabled} onChange={(event) => update(index, { ...question, enabled: event.target.checked })} /> Enabled</label></div>
          {question.type === "number" ? <><Field id={`${id}-unit`} label="Unit">{(props) => <Input {...props} disabled={disabled} maxLength={40} value={question.unit ?? ""} onChange={(event) => update(index, { ...question, unit: event.target.value || null })} />}</Field><div className="vendor-induction__number-limits"><Field id={`${id}-min`} label="Minimum">{(props) => <Input {...props} disabled={disabled} type="number" min="0" value={question.min ?? ""} onChange={(event) => update(index, { ...question, min: event.target.value === "" ? null : Number(event.target.value) })} />}</Field><Field id={`${id}-max`} label="Maximum">{(props) => <Input {...props} disabled={disabled} type="number" min="0" value={question.max ?? ""} onChange={(event) => update(index, { ...question, max: event.target.value === "" ? null : Number(event.target.value) })} />}</Field></div></> : null}
          {choiceType(question.type) ? <div className="vendor-induction__options vendor-induction__editor-wide"><span className="ui-field__label">Answer options</span>{question.options.map((option, optionIndex) => <div key={option.id}><label className="sr-only" htmlFor={`${id}-option-${option.id}`}>Option {optionIndex + 1}</label><Input id={`${id}-option-${option.id}`} disabled={disabled} maxLength={120} value={option.label} onChange={(event) => update(index, { ...question, options: question.options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) })} /><Button variant="quiet" size="compact" disabled={disabled || question.options.length <= 2} aria-label={`Remove option ${optionIndex + 1} from question ${index + 1}`} onClick={() => update(index, { ...question, options: question.options.filter((item) => item.id !== option.id) })}>Remove</Button></div>)}<Button variant="quiet" size="compact" disabled={disabled || question.options.length >= 12} onClick={() => update(index, { ...question, options: [...question.options, { id: inductionId(), label: "" }] })}>Add option</Button></div> : null}
          <Field id={`${id}-condition`} label="Show this question when">{(props) => <Select {...props} disabled={disabled || prior.length === 0} value={question.showIf?.questionId ?? ""} onChange={(event) => update(index, { ...question, showIf: event.target.value ? { questionId: event.target.value, optionIds: [] } : null })}><option value="">Always</option>{prior.map((entry) => <option key={entry.id} value={entry.id}>{entry.prompt || entry.key}</option>)}</Select>}</Field>
          {question.showIf ? <Field id={`${id}-condition-answer`} label="Answer is">{(props) => <Select {...props} disabled={disabled || !parent} value={question.showIf?.optionIds[0] ?? ""} onChange={(event) => update(index, { ...question, showIf: { questionId: question.showIf!.questionId, optionIds: event.target.value ? [event.target.value] : [] } })}><option value="">Select answer</option>{conditionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>}</Field> : null}
        </div>
      </article>;
    })}
  </div>;
}
