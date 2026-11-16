import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimationTierDetails } from "../leads/estimationCatalogueApi";
import "./estimate-line-tier-details.css";

/** Display-only disclosure. The caller supplies the exact selected tier and current source. */
export function EstimateLineTierDetails({ rowKey, label, tier, description, details }: {
  rowKey: string;
  label: string;
  tier: KnowledgeModeTier;
  description?: string | null;
  details: EstimationTierDetails | null | undefined;
}) {
  const tierName = KNOWLEDGE_MODE_TIER_LABELS[tier];
  return <details key={rowKey} className="estimate-line-tier-details">
    <summary tabIndex={0} aria-label={`Show details of tier: ${tierName} for ${label}`}>Show details of tier</summary>
    <div className="estimate-line-tier-details__content" role="region" aria-label={`${tierName} details for ${label}`}>
      {description ? <p className="estimate-line-tier-details__description">{description}</p> : null}
      {!details ? <p>{description ? "Specifications unavailable for this tier." : "Details unavailable for this tier."}</p>
        : !details.specifications.length ? <p>No specifications configured for this tier.</p>
        : <ul>{details.specifications.map(specification => <li key={specification.id}>
          {specification.name}{specification.brands.length
            ? ` (${specification.brands.map(brand => brand.name ?? "Brand unavailable").join(", ")})` : ""}
        </li>)}</ul>}
    </div>
  </details>;
}
