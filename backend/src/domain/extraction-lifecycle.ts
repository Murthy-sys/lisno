export type SuccessfulExtractionStatus =
  | "designer_review"
  | "estimator_review"
  | "submitted"
  | "changes_requested"
  | "approved";

const successfulStatuses = new Set<string>([
  "designer_review",
  "estimator_review",
  "submitted",
  "changes_requested",
  "approved"
]);

export interface CompletionReceipt {
  id: string;
  status: SuccessfulExtractionStatus;
  resultId: string;
  completedAt: string;
  replayed: boolean;
}

export interface CompletionRecord {
  id: string;
  status: string;
  workerResultId: string | null;
  completedAt: string | null;
}

export class ExtractionResultConflictError extends Error {
  constructor() {
    super("A different result has already completed this extraction job.");
    this.name = "ExtractionResultConflictError";
  }
}

export function completionReceiptFor(
  job: CompletionRecord,
  resultId: string,
  replayed: boolean
): CompletionReceipt | null {
  if (job.workerResultId === null) return null;
  if (
    job.workerResultId !== resultId ||
    !successfulStatuses.has(job.status) ||
    job.completedAt === null
  ) {
    throw new ExtractionResultConflictError();
  }
  return {
    id: job.id,
    status: job.status as SuccessfulExtractionStatus,
    resultId: job.workerResultId,
    completedAt: job.completedAt,
    replayed
  };
}

export interface ExtractionRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export const defaultExtractionRetryPolicy: Readonly<ExtractionRetryPolicy> = {
  maxAttempts: 5,
  initialDelayMs: 30_000,
  maxDelayMs: 15 * 60_000
};

export function retrySchedule(
  failedAt: string,
  attemptCount: number,
  policy: ExtractionRetryPolicy
): { terminal: boolean; nextAttemptAt: string | null } {
  if (attemptCount >= policy.maxAttempts) {
    return { terminal: true, nextAttemptAt: null };
  }
  const exponent = Math.max(0, attemptCount - 1);
  const delayMs = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * (2 ** exponent)
  );
  return {
    terminal: false,
    nextAttemptAt: new Date(new Date(failedAt).getTime() + delayMs).toISOString()
  };
}
