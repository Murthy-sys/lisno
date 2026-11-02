import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import {
  PROJECT_LANGUAGE_OPTIONS,
  type ProjectLanguage
} from "../../../../shared/projects/projectInitiation";
import type { FieldControlProps } from "../../components/ui/Field";
import "./project-language-multiselect.css";

export function ProjectLanguageMultiSelect({
  id, value, onChange, disabled, inputRef, ...field
}: FieldControlProps & {
  value: readonly ProjectLanguage[];
  onChange: (value: ProjectLanguage[]) => void;
  disabled?: boolean;
  inputRef?: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = `${id}-options`;
  const selectionId = `${id}-selection`;
  const selectedLabels = PROJECT_LANGUAGE_OPTIONS.filter((option) => value.includes(option.value)).map((option) => option.label);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) options.current[activeIndex]?.focus(); }, [open, activeIndex]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = PROJECT_LANGUAGE_OPTIONS.length - 1;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, last)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
    }
  }

  return <div ref={root} className="project-language-select"
    onBlur={(event) => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
    }}
    onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    }}>
    <button id={id} type="button" className="ui-control ui-select project-language-select__trigger"
      ref={(node) => { trigger.current = node; if (typeof inputRef === "function") inputRef(node); else if (inputRef) inputRef.current = node; }}
      aria-invalid={field["aria-invalid"]}
      aria-describedby={[field["aria-describedby"], selectionId].filter(Boolean).join(" ")}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      disabled={disabled}
      onClick={() => {
        if (open) close();
        else {
          setActiveIndex(Math.max(0, PROJECT_LANGUAGE_OPTIONS.findIndex((option) => value.includes(option.value))));
          setOpen(true);
        }
      }}>
      {selectedLabels.length ? selectedLabels.join(", ") : "Select languages"}
    </button>
    <span id={selectionId} className="sr-only" aria-live="polite">{value.length} {value.length === 1 ? "language" : "languages"} selected</span>
    {open ? <div className="project-language-select__menu">
      <div id={listId} role="listbox" aria-label="Languages Known" aria-multiselectable="true" className="project-language-select__options">
        {PROJECT_LANGUAGE_OPTIONS.map((option, index) => <button
          ref={(node) => { options.current[index] = node; }}
          key={option.value} type="button" role="option" aria-selected={value.includes(option.value)}
          tabIndex={index === activeIndex ? 0 : -1} disabled={disabled}
          onFocus={() => setActiveIndex(index)} onKeyDown={(event) => navigate(event, index)}
          onClick={() => onChange(value.includes(option.value) ? value.filter((language) => language !== option.value) : [...value, option.value])}>
          <span>{option.label}</span>
          {value.includes(option.value) ? <span className="project-language-select__selected" aria-hidden="true">Selected</span> : null}
        </button>)}
      </div>
      <div className="project-language-select__actions">
        <button type="button" disabled={disabled || !value.length} onClick={() => onChange([])}>Clear languages</button>
        <button type="button" disabled={disabled} onClick={() => close(true)}>Done</button>
      </div>
    </div> : null}
  </div>;
}
