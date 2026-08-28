import type {
  KnowledgeItemStatus,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";

export const KNOWLEDGE_SECTION_LABELS = {
  overview: "Overview",
  pricing: "Pricing",
  "quantity-margin": "Quantity & margin",
  scope: "Scope",
  recommendations: "Recommendations",
  quality: "Quality",
  execution: "Execution",
  advanced: "Advanced"
} as const satisfies Readonly<Record<KnowledgeSectionKey, string>>;

export const KNOWLEDGE_MASTER_LABELS = {
  uoms: "UOMs",
  vendors: "Vendors",
  taxes: "Taxes",
  priorities: "Priorities",
  surfaces: "Surfaces",
  modes: "Modes"
} as const satisfies Readonly<Record<KnowledgeMasterType, string>>;

export const KNOWLEDGE_ITEM_STATUS_LABELS = {
  draft: "Draft",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived"
} as const satisfies Readonly<Record<KnowledgeItemStatus, string>>;

export function formatKnowledgeMoney(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountPaise / 100);
}

export function formatKnowledgePercentage(percentageBps: number): string {
  return `${(percentageBps / 100).toFixed(2)}%`;
}

export function formatKnowledgeDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}
