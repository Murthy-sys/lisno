import { ApiError, apiClient } from "../../api/client";
import type { DesignerKeyCollectionReminderPage } from "../../../../shared/projects/designerAssignment";

export const keyCollectionReminderKeys = {
  all: ["key-collection-reminders"] as const,
  page: (actor: string, offset: number) => ["key-collection-reminders", actor, offset] as const
};
export const keyCollectionReminderPageSize = 20;
export type ReceivedCollectionReminders = DesignerKeyCollectionReminderPage & { receivedAt: number };
export async function getKeyCollectionReminders(offset: number, signal?: AbortSignal): Promise<ReceivedCollectionReminders> {
  const page = await apiClient.get<DesignerKeyCollectionReminderPage>(`/designer/key-collection-reminders?${new URLSearchParams({ status: "urgent", limit: String(keyCollectionReminderPageSize), offset: String(offset) })}`, { signal, showGlobalLoader: false });
  if (!Array.isArray(page.items) || !Number.isInteger(page.urgentCount) || page.urgentCount < 0 || !page.pagination ||
    !Number.isFinite(Date.parse(page.serverNow)) || page.nextRedAt !== null && !Number.isFinite(Date.parse(page.nextRedAt))) {
    throw new ApiError(502, "KEY_COLLECTION_REMINDERS_INVALID", "Collection reminders are unavailable. Please refresh.");
  }
  return { ...page, receivedAt: Date.now() };
}
