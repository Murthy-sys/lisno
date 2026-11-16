import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { MAX_MODE_DESCRIPTION_LENGTH, syncModeDescription } from "./knowledgeModeDescription";
import type { KnowledgeModeConfiguration } from "./knowledgeModeConfiguration";
import { PMC_SCOPE_LISTS } from "./knowledgePmcScope";

interface Props {
  readonly presentation?: "standard" | "inline";
  readonly description: string;
  readonly pmc?: KnowledgeModeConfiguration;
  readonly inHouse?: KnowledgeModeConfiguration;
  readonly readOnly: boolean;
  readonly validationAttempt: number;
  readonly error?: string;
  readonly onSave: (value: string) => void | boolean | Promise<void | boolean>;
  readonly onPendingChange: (pending: boolean) => void;
  readonly onPendingTextChange?: (text: string | null) => void;
}

function fitDescription(input: HTMLTextAreaElement) {
  input.style.height = "auto";
  const styles = getComputedStyle(input);
  const border = parseFloat(styles.borderTopWidth || "0") + parseFloat(styles.borderBottomWidth || "0");
  input.style.height = `${Math.ceil(input.scrollHeight + border)}px`;
}

export function KnowledgeModeDescriptionEditor({ presentation = "standard", description, pmc, inHouse, readOnly, validationAttempt, error, onSave, onPendingChange, onPendingTextChange }: Props) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const lastValidationAttempt = useRef(validationAttempt);
  const previousPmc = useRef(pmc);
  const previousInHouse = useRef(inHouse);
  const inline = presentation === "inline";
  const baseline = description;
  const editing = text !== null;
  const preview = text === null ? baseline : syncModeDescription(text, pmc, previousPmc.current, inHouse, previousInHouse.current);
  const pending = editing && preview.trim() !== baseline.trim();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useLayoutEffect(() => {
    if (inline && inputRef.current) fitDescription(inputRef.current);
  }, [inline, text, baseline]);
  useEffect(() => {
    const input = inputRef.current;
    if (!inline || !input) return;
    let width = input.getBoundingClientRect().width;
    let active = true;
    const resize = () => {
      const nextWidth = input.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      fitDescription(input);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(input);
    window.addEventListener("resize", resize);
    void document.fonts?.ready.then(() => { if (active) fitDescription(input); });
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [inline]);

  useEffect(() => {
    const previousPmcValue = previousPmc.current;
    const previousInHouseValue = previousInHouse.current;
    previousPmc.current = pmc;
    previousInHouse.current = inHouse;
    const pmcRemoved = PMC_SCOPE_LISTS.some((list) => {
      const remainingIds = new Set((pmc?.[list] ?? []).map((item) => item.id));
      return (previousPmcValue?.[list] ?? []).some((item) => !remainingIds.has(item.id));
    });
    const inHouseRemoved = PMC_SCOPE_LISTS.some((list) => {
      const remainingIds = new Set((inHouse?.[list] ?? []).map((item) => item.id));
      return (previousInHouseValue?.[list] ?? []).some((item) => !remainingIds.has(item.id));
    });
    if (pmcRemoved || inHouseRemoved) {
      setText((current) => current === null ? null : syncModeDescription(
        current,
        pmc,
        previousPmcValue,
        inHouse,
        previousInHouseValue
      ));
    }
  }, [inHouse, pmc]);

  useEffect(() => { onPendingTextChange?.(pending ? preview : null); }, [onPendingTextChange, pending, preview]);
  useEffect(() => () => onPendingTextChange?.(null), [onPendingTextChange]);
  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  useEffect(() => {
    if (inline) return;
    if (editing) inputRef.current?.focus();
    else if (restoreFocus.current) {
      editRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, inline]);
  useEffect(() => {
    if (validationAttempt > lastValidationAttempt.current && (pending || error)) {
      setText((current) => current ?? baseline);
      setLocalError(error ?? "Save or cancel this description before saving Mode.");
      inputRef.current?.focus();
    }
    lastValidationAttempt.current = validationAttempt;
  }, [baseline, error, pending, validationAttempt]);

  function close() {
    if (savingRef.current) return;
    setText(null);
    setLocalError(undefined);
    if (inline) inputRef.current?.focus();
    else restoreFocus.current = true;
  }

  async function save() {
    if (readOnly || text === null || savingRef.current) return;
    if (preview.trim().length > MAX_MODE_DESCRIPTION_LENGTH) {
      setLocalError(`Keep the description within ${MAX_MODE_DESCRIPTION_LENGTH} characters.`);
      inputRef.current?.focus();
      return;
    }
    if (inline && !pending) {
      close();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setLocalError(undefined);
    try {
      const result = onSave(preview.trim());
      const saved = result && typeof result === "object" && "then" in result ? await result : result;
      if (!mountedRef.current) return;
      if (saved === false) {
        setLocalError("Unable to save the description. Please try again.");
        inputRef.current?.focus();
        return;
      }
      savingRef.current = false;
      close();
    } catch {
      if (mountedRef.current) {
        setLocalError("Unable to save the description. Please try again.");
        inputRef.current?.focus();
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <div className={`knowledge-mode-description${inline ? " knowledge-mode-description--inline" : ""}`}>
      {editing || inline ? (
        <>
          <Field id={`${id}-paragraph`} label="Description" error={localError ?? error}
            hint={inline ? undefined : "Optional. Describe the work your client should see. Selected inclusions and exclusions stay in sync once you add text."}>
            {(props) => <Textarea {...props} ref={inputRef} rows={inline ? 1 : 4} value={text ?? baseline}
              disabled={!inline && readOnly} readOnly={(inline && readOnly) || saving}
              placeholder="Add a clear description of the work…" maxLength={MAX_MODE_DESCRIPTION_LENGTH}
              onChange={(event) => {
                if (readOnly || savingRef.current) return;
                setText(event.target.value); setLocalError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            />}
          </Field>
          {!inline ? <div className="knowledge-mode-description__preview" role="region" aria-label="Description preview">
            <span className="ui-field__label">Description preview</span>
            <p className="knowledge-mode-description__text">{preview || "No description added."}</p>
          </div> : null}
          <div className="knowledge-mode-description__actions">
            <Button variant="destructive-outline" size={inline ? "compact" : undefined}
              disabled={readOnly || saving || (inline && (text === null || text === baseline) && !localError)} onClick={close}>Cancel</Button>
            <Button size={inline ? "compact" : undefined} busy={saving} busyLabel="Saving…"
              disabled={readOnly || (inline && !pending)} onClick={save}>Save</Button>
          </div>
        </>
      ) : (
        <div className="knowledge-mode-description__display">
          <p className="knowledge-mode-description__text knowledge-mode-description__value" data-empty={!description.trim()}>
            {description || "No description added."}
          </p>
          {!readOnly ? <Button ref={editRef} aria-label="Edit Description" variant="quiet" size="compact"
            className="knowledge-mode-description__edit"
            onClick={() => { setText(description); setLocalError(undefined); }}>
            {description.trim() ? "Edit description" : "Add description"}
          </Button> : null}
        </div>
      )}
    </div>
  );
}
