import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { FieldControlProps } from "../../components/ui/Field";
import "./next-action-date-time.css";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const readDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
const fullDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const moveMonth = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset,
  Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + offset + 1, 0).getDate()), 12);

export function NextActionDateTime({ id, value, onChange, disabled, inputRef, ...field }: FieldControlProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputRef?: Ref<HTMLButtonElement>;
}) {
  const day = value;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cursor, setCursor] = useState(() => day ? readDate(day) : new Date());
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const focusDay = useRef(false);
  const calendarId = `${id}-calendar`;
  const today = dateKey(new Date());

  const close = (restoreFocus = false) => {
    if (!open) return;
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setClosing(false);
    } else {
      setClosing(true);
      closeTimer.current = window.setTimeout(() => setClosing(false), 180);
    }
  };
  const show = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setCursor(day ? readDate(day) : new Date());
    focusDay.current = true;
    setOpen(true);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open && focusDay.current) {
      calendar.current?.querySelector<HTMLButtonElement>(`[data-date="${dateKey(cursor)}"]`)?.focus();
      focusDay.current = false;
    }
  }, [open, cursor]);
  useEffect(() => {
    if (disabled) {
      window.clearTimeout(closeTimer.current);
      setOpen(false);
      setClosing(false);
    }
  }, [disabled]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const days = Array.from({ length: 42 }, (_, index) =>
    new Date(cursor.getFullYear(), cursor.getMonth(), index - monthStart.getDay() + 1, 12));
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -date.getDay(), End: 6 - date.getDay() };
    let next: Date;
    if (event.key in offsets) next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key], 12);
    else if (event.key === "PageUp" || event.key === "PageDown") next = moveMonth(date, event.key === "PageUp" ? -1 : 1);
    else return;
    event.preventDefault();
    focusDay.current = true;
    setCursor(next);
  };

  return <div ref={root} className="next-action-date-time"
    onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    }}
    onBlur={(event) => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
    }}>
    <div className="next-action-date-time__inputs">
      <button id={id} type="button" className="ui-control next-action-date-time__trigger"
        ref={(node) => { trigger.current = node; if (typeof inputRef === "function") inputRef(node); else if (inputRef) inputRef.current = node; }}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? calendarId : undefined}
        aria-required={field.required} aria-invalid={field["aria-invalid"]} aria-describedby={field["aria-describedby"]}
        disabled={disabled} onClick={() => open ? close(true) : show()}>
        <span>{day ? fullDate(readDate(day)) : "Select date"}</span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M7 2v6m10-6v6M3 11h18" /></svg>
      </button>
    </div>
    {open || closing ? <div ref={calendar} id={calendarId} className="next-action-date-time__calendar"
      role="dialog" aria-label="Choose next action date" aria-hidden={closing || undefined} inert={closing || undefined}
      data-closing={closing || undefined}>
      <div className="next-action-date-time__heading">
        <button type="button" aria-label="Previous month" onClick={() => setCursor(moveMonth(cursor, -1))}>‹</button>
        <strong aria-live="polite">{cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong>
        <button type="button" aria-label="Next month" onClick={() => setCursor(moveMonth(cursor, 1))}>›</button>
      </div>
      <table role="grid" aria-label="Calendar" className="next-action-date-time__grid">
        <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((date) => {
          const key = dateKey(date);
          return <td key={key} aria-selected={key === day}><button type="button" data-date={key}
            data-outside={date.getMonth() !== cursor.getMonth() || undefined} data-selected={key === day || undefined}
            aria-label={fullDate(date)} aria-current={key === today ? "date" : undefined}
            tabIndex={key === dateKey(cursor) ? 0 : -1} onKeyDown={(event) => navigate(event, date)}
            onClick={() => { onChange(key); close(true); }}>{date.getDate()}</button></td>;
        })}</tr>)}</tbody>
      </table>
      <div className="next-action-date-time__footer">
        <button type="button" onClick={() => { onChange(today); close(true); }}>Today</button>
        <button type="button" onClick={() => close(true)}>Close calendar</button>
      </div>
    </div> : null}
  </div>;
}
