import type { ChatPerson } from "./projectChatTypes";

/** A service identity, never a login, role, membership grant or human assignee. */
export interface ChatServiceAuthor {
  kind: "service";
  id: "lisno-ai";
  name: "Lisno AI";
  role?: never;
}
export const LISNO_AI: ChatServiceAuthor = { kind: "service", id: "lisno-ai", name: "Lisno AI" };
export type ChatAuthor = ChatPerson | ChatServiceAuthor;
export interface ChatAssistantParticipant extends ChatServiceAuthor {
  available: boolean;
}
export type AssistantRunStatus = "waiting_for_human" | "ready" | "leased" | "answered" | "needs_clarification" | "no_answer" | "suppressed" | "failed";
export interface AssistantSourceReference {
  id: string;
  label: string;
  /** Application-relative, permission-checked destination or no link. */
  href: string | null;
}
export interface AssistantSourceVersion {
  kind: string;
  id: string;
  version: string;
}
export interface AssistantFact {
  id: string;
  label: string;
  value: string;
  source: AssistantSourceReference;
}
export interface AssistantCatalogueCandidate {
  mainLineId: string;
  mainBasketId: string;
  subBasketId: string | null;
  name: string;
  basketName: string;
  subBasketName: string | null;
  revisionId: string;
  revisionVersion: number;
  itemVersion: number;
  uom: { id: string; code: string; name: string; decimalScale: number };
  available: boolean;
}
export interface AssistantRecommendation {
  sourceMainLineId: string;
  ruleId: string;
  requirement: "must" | "can";
  targetKind: "main_line" | "sub_basket";
  targetMainLineIds: string[];
  available: boolean;
  completionRequired: boolean;
  unavailableChildCount: number;
}
export interface AssistantAdditionLineInput {
  mainLineId: string;
  roomId: string | null;
  quantity: string | null;
  pricingMode: "pmc" | "sub_vendor" | "in_house" | null;
  /** Explicit extra quantity acknowledgement; never infer a replacement credit. */
  additiveConfirmed: boolean;
  optional: boolean;
}
export interface AssistantAdditionRequest { lines: AssistantAdditionLineInput[] }
export interface AssistantPriceLine {
  mainLineId: string;
  roomId: string | null;
  name: string;
  quantity: string | null;
  uom: string;
  pricingMode: "pmc" | "sub_vendor" | "in_house";
  optional: boolean;
  amountPaise: number | null;
  revisionId: string;
  missingInputs: string[];
}
/** Only customer-facing selling amounts. No base costs or margin settings. */
export interface AssistantCommercialSnapshot {
  currency: "INR";
  policy: "configuration-selling-v1";
  state: "complete" | "partial" | "clarification_required";
  lines: AssistantPriceLine[];
  subtotalPaise: number | null;
  gstRateBps: number;
  gstPaise: number | null;
  totalPaise: number | null;
  optionalSubtotalPaise: number | null;
  approvedBaselinePaise: number | null;
  hypotheticalTotalPaise: number | null;
  assumptions: string[];
  missingInputs: string[];
}
export interface AssistantGeneratedResult {
  /** Bounded conversational paragraphs, grounded in the selected verified facts. */
  narrative?: Array<{ text: string; factIds: string[] }>;
  kind: "status" | "catalogue" | "price" | "clarification" | "handoff" | "no_answer";
  facts: AssistantFact[];
  candidates: AssistantCatalogueCandidate[];
  missingInputs: string[];
  commercial: AssistantCommercialSnapshot | null;
  freshness: AssistantSourceVersion[];
}
export interface ChatAssistantResult extends Omit<AssistantGeneratedResult, "freshness" | "kind"> {
  id: string;
  projectId: string;
  messageId: string;
  kind: AssistantGeneratedResult["kind"];
  checkedAt: string;
  stale: boolean;
  commercialAccess: "allowed" | "restricted" | "none";
}
export interface ChatAssistantMessageState {
  stateVersion?: number;
  runId: string;
  generation: number;
  status: AssistantRunStatus;
  eligibleAt: string;
  resultId: string | null;
  checkedAt: string | null;
  notified: ChatPerson | null;
  routing: "not_required" | "notified" | "unroutable";
  canRequest: boolean;
  failureCode: string | null;
}
export interface ChatAssistantRequestInput { idempotencyKey: string; expectedVersion: number }
