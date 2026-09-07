import { useEffect, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { MAX_MODE_DESCRIPTION_LENGTH } from "./knowledgeModeDescription";

interface Props {
  readonly description: string;
  readonly readOnly: boolean;
  readonly validationAttempt: number;
  readonly error?: string;
  readonly onSave: (value: string) => void;
  readonly onPendingChange: (pending: boolean) => void;
}

export function KnowledgeModeDescriptionEditor({ description, readOnly, validationAttempt, error, onSave, onPendingChange }: Props) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const lastValidationAttempt = useRef(validationAttempt);
  const editing = text !== null;
  const pending = editing && text !== description;

  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (restoreFocus.current) {
      editRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);
  useEffect(() => {
    if (validationAttempt > lastValidationAttempt.current && (pending || error)) {
      setText((current) => current ?? description);
      setLocalError(error ?? "Save or cancel this paragraph before saving Mode.");
      inputRef.current?.focus();
    }
    lastValidationAttempt.current = validationAttempt;
  }, [description, error, pending, validationAttempt]);

  function close() {
    setText(null);
    setLocalError(undefined);
    restoreFocus.current = true;
  }

  function save() {
    if (readOnly || text === null) return;
    if (!text.trim() || text.length > MAX_MODE_DESCRIPTION_LENGTH) {
      setLocalError(`Enter a paragraph of 1–${MAX_MODE_DESCRIPTION_LENGTH} characters.`);
      inputRef.current?.focus();
      return;
    }
    onSave(text.trim());
    close();
  }

  return (
    <div className="knowledge-mode-description">
      {editing ? (
        <>
          <Field id={`${id}-paragraph`} label="Mode paragraph" error={localError ?? error}>
            {(props) => <Textarea {...props} ref={inputRef} rows={4} value={text} disabled={readOnly}
              maxLength={MAX_MODE_DESCRIPTION_LENGTH}
              onChange={(event) => { setText(event.target.value); setLocalError(undefined); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            />}
          </Field>
          <div className="knowledge-mode-description__actions">
            <Button variant="quiet" disabled={readOnly} onClick={close}>Cancel</Button>
            <Button disabled={readOnly} onClick={save}>Save</Button>
          </div>
        </>
      ) : (
        <p className="knowledge-mode-description__text">
          <span>{description}</span>{!readOnly ? <>{" "}<IconButton
            ref={editRef} label="Edit Mode paragraph" variant="quiet" icon={<Pencil aria-hidden="true" />}
            onClick={() => { setText(description); setLocalError(undefined); }}
          /></> : null}
        </p>
      )}
    </div>
  );
}
