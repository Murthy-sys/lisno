import type { MarginDefault, MarginMatrix } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KNOWLEDGE_MODE_TIERS } from "../../../../shared/knowledge/knowledgeModeTiers";

export function matrixFixture(basketId: string, subBasketId: string): MarginMatrix {
  const defaults = KNOWLEDGE_MODE_TIERS.flatMap((tier, index): MarginDefault[] => [
    { tier, mode: "pmc", ranges: [{ key: "margin", minimumBps: 1000, maximumBps: 1500 + 100 * index }], provenance: "existing" },
    { tier, mode: "sub_vendor", ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 2500 + 500 * index }], provenance: "approved" },
    { tier, mode: "in_house", ranges: [], provenance: "unset", resolution: "unset" }
  ]);
  return { basketId, subBasketId, versionToken: "matrix-9", baselineVersion: 2, totalMainLines: 3,
    defaults, issues: [], exceptions: [{ tier: "premium", mode: "sub_vendor", mainLineId: "first", mainLineName: "Ceiling A",
      ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 3500 }] }] };
}
