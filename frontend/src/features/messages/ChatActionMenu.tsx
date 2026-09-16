import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MoreVertical } from "lucide-react";

export interface ChatMenuItem { label: string; onSelect?: () => void; to?: string; selected?: boolean }

/** A small non-modal action menu. Portalling keeps transcript overflow from clipping it. */
export function ChatActionMenu({ label, items, icon = <MoreVertical size={20} aria-hidden="true" /> }: { label: string; items: ChatMenuItem[]; icon?: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const popup = menu.current;
      if (!anchor || !popup) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      setPosition({ top: Math.max(8, Math.min(anchor.bottom + 4, viewportHeight - popup.offsetHeight - 8)), left: Math.max(8, Math.min(anchor.right - popup.offsetWidth, viewportWidth - popup.offsetWidth - 8)) });
    };
    positionMenu();
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const focusOutside = (event: FocusEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focusOutside); window.removeEventListener("resize", positionMenu); window.removeEventListener("scroll", positionMenu, true); };
  }, [open]);
  function close() { trigger.current?.focus(); setOpen(false); }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab") { close(); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  }
  return <>
    <button ref={trigger} type="button" className="project-chat-icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>{icon}</button>
    {open ? createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="project-chat-popover" style={position} onKeyDown={keyDown}>{items.map(item => item.to ? <Link key={item.label} role="menuitem" tabIndex={-1} to={item.to} onClick={close}>{item.label}</Link> : <button key={item.label} role="menuitem" tabIndex={-1} type="button" onClick={() => { close(); item.onSelect?.(); }}><span>{item.label}</span>{item.selected ? <span><span aria-hidden="true">✓</span><span className="sr-only">Current view</span></span> : null}</button>)}</div>, document.body) : null}
  </>;
}

export function chatInitials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase(); }

export function chatSenderColor(userId: string) {
  const colors = ["#0b6a62", "#86550a", "#7753a1", "#9d365d", "#386c27", "#355c9a"];
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[(hash >>> 0) % colors.length];
}
