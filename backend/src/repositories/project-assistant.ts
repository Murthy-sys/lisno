import type { ChatPerson } from "../contracts/project-chat.js";
import type { AssistantGeneratedResult, AssistantReadScope, AssistantRunStatus } from "../contracts/project-chat-assistant.js";

export interface AssistantRun extends AssistantReadScope {
  /** Earlier unanswered fragments retained in root-to-newest order. Optional for legacy runs. */
  coalescedSources?: Array<{runId: string; messageId: string; messageVersion: number; messageSequence: number}>;
  coalescingStartedAt?: string;
  id: string; messageId: string; messageVersion: number; messageSequence: number; responseAfterSequence: number; generation: number;
  status: AssistantRunStatus; stateVersion: number; eligibleAt: string; createdAt: string; updatedAt: string;
  explicit: boolean; notified: ChatPerson | null; routing: "not_required" | "notified" | "unroutable";
  workerAttempts: number; providerAttempts: number; leaseToken: string | null; leaseUntil: string | null;
  generationStartedAt: string | null;
  resultId: string | null; answerMessageId: string | null; checkedAt: string | null; failureCode: string | null;
}
export interface AssistantStoredResult extends AssistantGeneratedResult {
  id: string; projectId: string; messageId: string; runId: string; checkedAt: string;
}
/** Replay and usage receipts are durable. They must never be TTL deleted. */
export type AssistantReceipt = {
  id: string; runId: string; createdAt: string;
  fingerprint: string; amount: number; settled: boolean;
} & ({kind: "generation" | "publication" | "routing"; projectId: string} | {kind: "usage"; projectId: string | null});
export interface AssistantCounter { id: string; value: number; updatedAt: string }
/** All writes require the enclosing chat mutation transaction/global coordination fence. */
export interface AssistantTransactions {
  run(id: string): Promise<AssistantRun | null>;
  latestRun(projectId: string, messageId: string): Promise<AssistantRun | null>;
  projectRuns(projectId: string): Promise<AssistantRun[]>;
  dueRuns(now: string, limit: number): Promise<AssistantRun[]>;
  waitingRuns(limit: number): Promise<AssistantRun[]>;
  saveRun(run: AssistantRun): Promise<void>;
  result(projectId: string, id: string): Promise<AssistantStoredResult | null>;
  saveResult(result: AssistantStoredResult): Promise<void>;
  receipt(id: string): Promise<AssistantReceipt | null>;
  saveReceipt(receipt: AssistantReceipt): Promise<void>;
  counter(id: string): Promise<AssistantCounter | null>;
  saveCounter(counter: AssistantCounter): Promise<void>;
}
