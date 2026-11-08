import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import "./estimateSubmissionChecklist.css";

const statements = [
  "I confirm that I have mapped the items correctly according to the customer's requirements.",
  "I understand that Lisno promotes transparency in information shared with clients. I will not practise underselling to gain sales under any circumstances.",
  "I confirm that I have explained to the customer how to read and understand the estimate."
] as const;

export interface EstimateSubmissionChecklistProps {
  action: "submit" | "send";
  busy: boolean;
  canConfirm: boolean;
  submissionEffect?: string;
  blockingReason?: string;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function EstimateSubmissionChecklist({
  action, busy, canConfirm, submissionEffect, blockingReason, onConfirm, onClose, returnFocusRef, fallbackFocusRef
}: EstimateSubmissionChecklistProps) {
  const [checked, setChecked] = useState(() => statements.map(() => false));
  const [validation, setValidation] = useState<"unchecked" | "blocked" | null>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const checkboxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const validationRef = useRef<HTMLParagraphElement>(null);
  const validationId = useId();
  const uncheckedCount = checked.filter(value => !value).length;
  const validationMessage = validation === "unchecked" && uncheckedCount > 0
    ? `Confirm the ${uncheckedCount} unchecked ${uncheckedCount === 1 ? "statement" : "statements"} before continuing.`
    : validation === "blocked" && !canConfirm
      ? blockingReason ?? "The estimate is not ready for submission. Close this checklist and review the latest estimate updates."
      : null;

  useEffect(() => {
    if (validation === "blocked" && validationMessage) validationRef.current?.focus();
  }, [validation, validationMessage]);

  const confirm = () => {
    if (busy) return;
    const firstUnchecked = checked.findIndex(value => !value);
    if (firstUnchecked !== -1) {
      setValidation("unchecked");
      checkboxRefs.current[firstUnchecked]?.focus();
      return;
    }
    if (!canConfirm) {
      setValidation("blocked");
      validationRef.current?.focus();
      return;
    }
    setValidation(null);
    onConfirm();
  };

  return <Dialog
    title="Before submitting your estimate"
    eyebrow="Estimate submission"
    description={submissionEffect ? `${submissionEffect} Confirm all three statements to continue.` : "Confirm all three statements to continue."}
    className="estimate-submission-checklist"
    busy={busy}
    onClose={onClose}
    initialFocusRef={firstCheckboxRef}
    returnFocusRef={returnFocusRef}
    fallbackFocusRef={fallbackFocusRef}
  >
    <div className="ui-dialog__body estimate-submission-checklist__statements">
      {statements.map((statement, index) => <label key={statement} className="estimate-submission-checklist__statement">
        <input
          ref={element => {
            checkboxRefs.current[index] = element;
            if (index === 0) firstCheckboxRef.current = element;
          }}
          type="checkbox"
          checked={checked[index]}
          disabled={busy}
          aria-invalid={validation === "unchecked" && !checked[index] || undefined}
          aria-describedby={validation === "unchecked" && !checked[index] ? validationId : undefined}
          onChange={event => {
            const selected = event.target.checked;
            setChecked(current => current.map((value, position) => position === index ? selected : value));
            setValidation(null);
          }}
        />
        <span>{statement}</span>
      </label>)}
      {validationMessage ? <p ref={validationRef} id={validationId} role="alert" tabIndex={-1}
        className="estimate-submission-checklist__feedback">{validationMessage}</p> : null}
      {busy ? <p role="status" className="estimate-submission-checklist__feedback">
        {action === "send" ? "Your estimate is being sent. Please wait." : "Your estimate is being submitted. Please wait."}
      </p> : null}
    </div>
    <div className="ui-dialog__actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      <button type="button" className="ui-button ui-button--primary ui-button--default"
        aria-busy={busy || undefined} aria-describedby={validationMessage ? validationId : undefined}
        onClick={confirm}>
        <span className="ui-button__stack"><span className="ui-button__content"><span>
          {busy ? action === "send" ? "Sending…" : "Submitting…" : action === "send" ? "Confirm and send" : "Confirm and submit"}
        </span></span></span>
      </button>
    </div>
  </Dialog>;
}
