import { useRef, useState, type RefObject } from "react";
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
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function EstimateSubmissionChecklist({
  action, busy, canConfirm, onConfirm, onClose, returnFocusRef, fallbackFocusRef
}: EstimateSubmissionChecklistProps) {
  const [checked, setChecked] = useState(() => statements.map(() => false));
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const ready = checked.every(Boolean) && canConfirm && !busy;

  return <Dialog
    title="Before submitting your estimate"
    eyebrow="Estimate submission"
    description="Confirm all three statements to continue."
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
          ref={index === 0 ? firstCheckboxRef : undefined}
          type="checkbox"
          checked={checked[index]}
          disabled={busy}
          onChange={event => {
            const selected = event.target.checked;
            setChecked(current => current.map((value, position) => position === index ? selected : value));
          }}
        />
        <span>{statement}</span>
      </label>)}
    </div>
    <div className="ui-dialog__actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button disabled={!ready} busy={busy} busyLabel={action === "send" ? "Sending…" : "Submitting…"}
        onClick={() => { if (ready) onConfirm(); }}>
        {action === "send" ? "Confirm and send" : "Confirm and submit"}
      </Button>
    </div>
  </Dialog>;
}
