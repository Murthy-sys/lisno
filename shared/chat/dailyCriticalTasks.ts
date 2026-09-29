/** Authenticated, recipient-scoped presentation of the 17:00 India-time task list. */
export interface ChatAvailability {
  readonly timezone: "Asia/Kolkata";
  readonly writable: boolean;
  readonly nextOpenAt: string | null;
  readonly nextChangeAt: string;
}

export type DailyCriticalTaskItem =
  | {
      readonly kind: "chat_action";
      readonly id: string;
      readonly projectId: string;
      readonly projectName: string;
      readonly title: string;
      readonly dueDate: string;
      readonly messageId: string;
    }
  | {
      readonly kind: "workflow_task";
      readonly id: string;
      readonly projectId: string;
      readonly projectName: string;
      readonly title: string;
      readonly dueAt: string;
      readonly status: string;
    };

export interface DailyCriticalTasks {
  readonly timezone: "Asia/Kolkata";
  readonly localDate: string;
  readonly scheduledAt: string;
  readonly acknowledgedAt: string | null;
  readonly items: readonly DailyCriticalTaskItem[];
}
