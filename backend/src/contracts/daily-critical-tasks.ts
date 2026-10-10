export interface ChatAvailability {
  readonly timezone: "Asia/Kolkata";
  readonly writable: boolean;
  readonly nextOpenAt: string | null;
  readonly nextChangeAt: string;
}

export type DailyCriticalTaskItem =
  | { readonly kind: "chat_action"; readonly id: string; readonly projectId: string; readonly projectName: string; readonly title: string; readonly dueDate: string; readonly messageId: string }
  | { readonly kind: "workflow_task"; readonly id: string; readonly projectId: string; readonly projectName: string; readonly title: string; readonly dueAt: string; readonly status: string };

export interface DailyCriticalTasks {
  readonly timezone: "Asia/Kolkata";
  readonly localDate: string;
  readonly scheduledAt: string;
  readonly acknowledgedAt: string | null;
  readonly items: readonly DailyCriticalTaskItem[];
}

/** Current authorized work; reading it never creates a scheduled delivery. */
export interface CurrentCriticalTaskReview {
  readonly timezone: "Asia/Kolkata";
  readonly checkedAt: string;
  readonly items: readonly DailyCriticalTaskItem[];
  readonly receipt: { readonly localDate: string; readonly acknowledgedAt: string | null } | null;
}

export interface DailyCriticalAcknowledgment {
  readonly localDate: string;
  readonly acknowledgedAt: string;
}
