import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimationTierDetails } from "../leads/estimationCatalogueApi";
import "./estimate-line-tier-details.css";

/** Client-safe by default. Internal callers must explicitly enable specifications. */
export function EstimateLineTierDetails({ rowKey, label, tier, description, details, showInternalDetails = false }: {
  rowKey: string;
  label: string;
  tier: KnowledgeModeTier;
  description?: string | null;
  details?: EstimationTierDetails | null;
  showInternalDetails?: boolean;
}) {
  const tierName = KNOWLEDGE_MODE_TIER_LABELS[tier];
  const hasDescription = typeof description === "string" && description.trim().length > 0;
  return <section key={rowKey} className="estimate-line-tier-details" aria-label={`${tierName} description for ${label}`}>
    <div className="estimate-line-tier-details__heading">
      <span className="estimate-line-tier-details__label">Description</span>
      <span className="estimate-line-tier-details__tier">{tierName}</span>
    </div>
    <p className={`estimate-line-tier-details__description${hasDescription ? "" : " estimate-line-tier-details__empty"}`}>
      {hasDescription ? description : "Description not added."}
    </p>
    {showInternalDetails ? <details className="estimate-line-tier-details__internal">
      <summary tabIndex={0} aria-label={`Show internal specifications: ${tierName} for ${label}`}>Internal specifications</summary>
      <div className="estimate-line-tier-details__content" role="region" aria-label={`${tierName} internal specifications for ${label}`}>
        {!details ? <p>Specifications unavailable for this tier.</p>
          : !details.specifications.length ? <p>No specifications configured for this tier.</p>
          : <ul>{details.specifications.map(specification => <li key={specification.id}>
            {specification.name}{specification.brands.length
              ? ` (${specification.brands.map(brand => brand.name ?? "Brand unavailable").join(", ")})` : ""}
          </li>)}</ul>}
      </div>
    </details> : null}
  </section>;
}
