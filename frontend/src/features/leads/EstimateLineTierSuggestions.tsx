import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimateTierSuggestionState } from "./useEstimateTierSuggestions";

export function EstimateLineTierSuggestions({ label, mainLineId, state, moneyPaise }: {
  label: string;
  mainLineId: string;
  state: EstimateTierSuggestionState;
  moneyPaise: (value: number) => string;
}) {
  return <div className="estimate-line-tier-suggestions" role="group" aria-label={`Tier price suggestions for ${label}`}>
    {KNOWLEDGE_MODE_TIERS.map(tier => {
      const cell = state.status === "ready"
        ? state.comparison.tiers.find(option => option.modeTier === tier)?.lines.find(line => line.mainLineId === mainLineId)
        : undefined;
      const status = state.status === "loading" ? "Checking current price…"
        : state.status === "error" ? state.message
        : state.status === "unavailable" ? state.message ?? "Complete the current item details to compare tier prices."
        : cell?.unavailableReason || (cell?.amountPaise == null ? "Price unavailable for the current item details." : null);
      return <p key={tier}><span>If you choose {KNOWLEDGE_MODE_TIER_LABELS[tier]}: </span>
        {status ? <span>{status}</span> : cell ? <span>
          {cell.ratePaise === null ? null : <>{moneyPaise(cell.ratePaise)} / {cell.uomName}; </>}
          {moneyPaise(cell.amountPaise!)} for {cell.quantity} {cell.uomName}, excluding GST.
        </span> : null}
      </p>;
    })}
    {state.status === "error" ? <button type="button" className="button button--secondary"
      aria-label={`Retry tier prices for ${label}`} onClick={state.retry}>Retry tier prices</button> : null}
  </div>;
}
