import type {
  KnowledgeItemStatus,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import type { KnowledgeWorkspaceSectionKey } from "./knowledgeWorkspaceSections";

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

export const KNOWLEDGE_WORKSPACE_SECTION_LABELS = {
  overview: "Overview",
  mode: "Mode",
  recommendations: "Recommendations",
  quality: "Quality"
} as const satisfies Readonly<Record<KnowledgeWorkspaceSectionKey, string>>;

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

const KNOWLEDGE_INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export function formatKnowledgeMoney(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new RangeError("Paise must be a non-negative safe integer.");
  }

  const exactPaise = BigInt(amountPaise);
  const wholeRupees = exactPaise / 100n;
  const fractionalPaise = (exactPaise % 100n).toString().padStart(2, "0");
  return `${KNOWLEDGE_INR_WHOLE.format(wholeRupees)}.${fractionalPaise}`;
}

export type RupeeInputParseResult =
  | { readonly status: "valid"; readonly paise: number }
  | { readonly status: "incomplete" }
  | { readonly status: "invalid"; readonly reason: "format" | "unsafe" };

const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER);
const COMPLETE_RUPEE_INPUT = /^(\d+)(?:\.(\d{1,2}))?$/u;
const INCOMPLETE_RUPEE_INPUT = /^\d*\.$/u;

/** Converts editable rupee text to exact integer paise without floating-point arithmetic. */
export function parseRupeeInputToPaise(value: string): RupeeInputParseResult {
  if (value === "" || INCOMPLETE_RUPEE_INPUT.test(value)) {
    return { status: "incomplete" };
  }

  const match = COMPLETE_RUPEE_INPUT.exec(value);
  if (!match) return { status: "invalid", reason: "format" };

  const wholeRupees = BigInt(match[1]);
  const fractionalPaise = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const paise = wholeRupees * 100n + fractionalPaise;
  if (paise > MAX_SAFE_PAISE) return { status: "invalid", reason: "unsafe" };

  return { status: "valid", paise: Number(paise) };
}

/** Formats safe, non-negative integer paise as canonical editable rupee text. */
export function formatPaiseForRupeeInput(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new RangeError("Paise must be a non-negative safe integer.");
  }
  if (amountPaise === 0) return "0";

  const digits = BigInt(amountPaise);
  const wholeRupees = digits / 100n;
  const fractionalPaise = (digits % 100n).toString().padStart(2, "0");
  return `${wholeRupees}.${fractionalPaise}`;
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
