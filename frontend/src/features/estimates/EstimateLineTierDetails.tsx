import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimationTierDetails } from "../leads/estimationCatalogueApi";
import "./estimate-line-tier-details.css";

/** Each audience receives only its content; internal access is explicitly enabled. */
export function EstimateLineTierDetails({ rowKey, label, tier, description, details, showInternalDetails = false }: {
  rowKey: string;
  label: string;
  tier: KnowledgeModeTier;
  description?: string | null;
  details?: EstimationTierDetails | null;
  showInternalDetails?: boolean;
}) {
  const tierName = KNOWLEDGE_MODE_TIER_LABELS[tier];
  if (!showInternalDetails) {
    if (typeof description !== "string" || !description.trim()) return null;
    return <section key={rowKey} className="estimate-line-tier-details" aria-label={`${tierName} description for ${label}`}>
      <p className="estimate-line-tier-details__description">{description}</p>
    </section>;
  }

  const specifications = details?.specifications.filter(specification => specification.name.trim());
  if (!specifications?.length) return null;
  return <section key={rowKey} className="estimate-line-tier-details" aria-label={`${tierName} internal specifications for ${label}`}>
    <ul className="estimate-line-tier-details__specifications">{specifications.map(specification => {
      const brandNames = specification.brands.map(brand => brand.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
      return <li key={specification.id}>
        {specification.name}{brandNames.length ? ` (${brandNames.join(", ")})` : ""}
      </li>;
    })}</ul>
  </section>;
}
