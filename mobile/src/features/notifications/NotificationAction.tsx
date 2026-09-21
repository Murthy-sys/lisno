import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";

export function NotificationAction({ record }: { readonly record: Record<string, unknown> }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const id = typeof record.id === "string" ? record.id : typeof record.notificationId === "string" ? record.notificationId : null;
  const isRead = record.read === true || typeof record.readAt === "string";
  const projectId = typeof record.projectId === "string" ? record.projectId : null;
  const mutation = useMutation({
    mutationFn: () => context.runtime.api.authenticated.put(`/notifications/${encodeURIComponent(id!)}/read`),
    onSuccess: () => invalidate("notification-changed")
  });
  if (!id) return null;
  return <View style={{ gap: spacing.xs }}>{isRead ? <Text style={{ color: colors.success, fontFamily: fonts.medium, fontSize: 12 }}>Read</Text> : <Button label="Mark as read" variant="secondary" loading={mutation.isPending} onPress={() => mutation.mutate()} />}{projectId ? <Button label="Open conversation" variant="quiet" onPress={() => router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: projectId } })} /> : null}</View>;
}
