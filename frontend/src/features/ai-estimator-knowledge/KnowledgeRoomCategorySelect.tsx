import { useEffect, useId, useRef, useState } from "react";
import { ROOM_CATEGORIES, isRoomCategoryId, type RoomCategoryId } from "../../../../shared/estimation/estimateRoomOptions";
import { Field } from "../../components/ui/Field";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

export function roomCategorySummary(value: KnowledgeJsonValue | undefined): string {
  if (value === undefined || Array.isArray(value) && value.length === 0) return "All rooms and places";
  if (!Array.isArray(value) || !value.every(isRoomCategoryId) || new Set(value).size !== value.length) return "Saved selection needs review";
  return ROOM_CATEGORIES.filter(option => value.includes(option.id)).map(option => option.label).join(", ");
}

export function KnowledgeRoomCategorySelect({ value, disabled, onChange }: {
  value: KnowledgeJsonValue | undefined;
  disabled: boolean;
  onChange: (categories: RoomCategoryId[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = Array.isArray(value) ? value.filter(isRoomCategoryId) : [];

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <div ref={root} className="knowledge-room-categories"
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
    <Field id={id} label="Applicable rooms / places" hint="Leave empty to allow this Main Line in all rooms and places.">
      {field => <button {...field} aria-describedby={`${field["aria-describedby"]} ${id}-selection`} type="button" className="ui-control ui-select knowledge-room-categories__trigger"
        ref={trigger} disabled={disabled} aria-expanded={open} aria-controls={open ? `${id}-choices` : undefined}
        onClick={() => setOpen(current => !current)}>
        <span id={`${id}-selection`}>{roomCategorySummary(value)}</span>
      </button>}
    </Field>
    {open && !disabled ? <div id={`${id}-choices`} role="group" aria-label="Room and place options" className="knowledge-room-categories__choices">
      {ROOM_CATEGORIES.map(({ id: category, label }) => <label key={category}>
        <input type="checkbox" checked={selected.includes(category)} onChange={event => {
          const next = new Set(selected);
          if (event.target.checked) next.add(category);
          else next.delete(category);
          onChange(ROOM_CATEGORIES.map(option => option.id).filter(option => next.has(option)));
        }} />
        {label}
      </label>)}
    </div> : null}
  </div>;
}
