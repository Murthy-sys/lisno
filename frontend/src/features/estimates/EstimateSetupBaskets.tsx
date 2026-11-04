import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

export interface EstimateSetupBasketsProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  onClearSearch: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  showTools?: boolean;
  status?: ReactNode;
  children?: ReactNode;
}

/** Catalogue data and status remain role-scoped; only the screen composition is shared. */
export function EstimateSetupBaskets({ search, onSearchChange, searchRef, onClearSearch, onRefresh, refreshing, showTools = true, status, children }: EstimateSetupBasketsProps) {
  const titleId = useId();
  return <section className="estimate-panel configured-estimate-chooser" aria-labelledby={titleId}>
    <div className="configured-estimate-chooser__heading">
      <div><p className="eyebrow">Configuration</p><h2 id={titleId}>Main Baskets</h2><p>Select the Main Baskets for this estimate. Available Main Lines and temporary items appear in the builder.</p></div>
      {showTools ? <div className="configured-estimate-chooser__tools">
        <div className="configured-estimate-chooser__search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input ref={searchRef} type="search" aria-label="Search baskets" placeholder="Search baskets..." value={search} onChange={(event) => onSearchChange(event.target.value)} />
          {search ? <button type="button" aria-label="Clear search" onClick={onClearSearch}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button> : null}
        </div>
        <button type="button" className="button button--secondary" disabled={refreshing} onClick={onRefresh}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.1 8a7 7 0 0 1 11.6-3L20 8M4 16l3.3 3A7 7 0 0 0 18.9 16" /></svg><span>Refresh available items</span></button>
      </div> : null}
    </div>
    {status}
    {children}
  </section>;
}

export function ConfigureSelectionFooter({ count, clearDisabled, continueDisabled, onClear, onContinue }: {
  count: number;
  clearDisabled: boolean;
  continueDisabled: boolean;
  onClear: () => void;
  onContinue: () => void;
}) {
  const footerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const footer = footerRef.current;
    const workspace = footer?.closest<HTMLElement>(".estimate-workspace");
    if (!footer || !workspace) return;
    const measure = () => workspace.style.setProperty("--estimate-selection-footer-height", `${Math.ceil(footer.getBoundingClientRect().height)}px`);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(footer);
    measure();
    return () => {
      observer?.disconnect();
      workspace.style.removeProperty("--estimate-selection-footer-height");
    };
  }, []);

  return <div ref={footerRef} className="estimate-selection-footer" role="region" aria-label="Basket selection">
    <div className="estimate-selection-footer__summary">
      <span className="estimate-selection-footer__count" role="status" aria-live="polite" aria-atomic="true">{count} selected</span>
      <button type="button" className="estimate-selection-footer__clear" disabled={clearDisabled} onClick={onClear}>Clear all</button>
    </div>
    <button type="button" className="button button--primary estimate-selection-footer__continue" disabled={continueDisabled} onClick={onContinue}>
      Continue to item selection
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
    </button>
  </div>;
}
