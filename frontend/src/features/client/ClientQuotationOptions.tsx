import { useEffect, useRef, type ReactNode } from "react";

/** Secondary estimate actions stay in the normal tab order when expanded. */
export function ClientQuotationOptions({ children, context }: { children: ReactNode; context: string }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = disclosure.current;
    if (!element?.open) return;
    const containedFocus = element.contains(document.activeElement);
    element.open = false;
    if (containedFocus) trigger.current?.focus();
  }, [context]);
  return <details className="client-quotation__options" ref={disclosure} onKeyDown={event => {
    if (event.key !== "Escape" || !disclosure.current?.open) return;
    event.preventDefault();
    event.stopPropagation();
    disclosure.current.open = false;
    trigger.current?.focus();
  }}>
    <summary ref={trigger} tabIndex={0}>Estimate options</summary>
    <div className="client-quotation__options-content">{children}</div>
  </details>;
}
