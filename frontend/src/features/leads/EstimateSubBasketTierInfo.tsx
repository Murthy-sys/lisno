import type { MouseEventHandler, RefObject } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateLineTierSuggestions } from "./EstimateLineTierSuggestions";
import type { EstimateTierSuggestionState } from "./useEstimateTierSuggestions";

export function EstimateTierInfoButton({ label, onClick }: {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return <button type="button" className="estimate-tier-info-button" aria-label={`Tier price information for ${label}`}
    aria-haspopup="dialog" onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.01" />
    </svg>
  </button>;
}

export interface EstimateTierInfoLine {
  key: string;
  label: string;
  mainLineId: string;
  state: EstimateTierSuggestionState;
}

/** The editor supplies the scoped lines and authoritative prices; this dialog only presents them. */
export function EstimateSubBasketTierInfo({ title, lines, moneyPaise, onClose, returnFocusRef, fallbackFocusRef }: {
  title: string;
  lines: readonly EstimateTierInfoLine[];
  moneyPaise: (value: number) => string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  return <Dialog title={title} eyebrow="Estimate options" className="estimate-sub-basket-tier-info"
    onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}>
    <div className="estimate-sub-basket-tier-info__lines">
      {lines.length ? lines.map(line => <section key={line.key} className="estimate-sub-basket-tier-info__line" aria-label={line.label}>
        <h3>{line.label}</h3>
        <EstimateLineTierSuggestions label={line.label} mainLineId={line.mainLineId} state={line.state} moneyPaise={moneyPaise} />
      </section>) : <p>No included items in this Sub Basket.</p>}
    </div>
    <div className="estimate-sub-basket-tier-info__actions"><button type="button" className="button button--secondary" onClick={onClose}>Close</button></div>
  </Dialog>;
}
