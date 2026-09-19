import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

const STAGES = ["new_lead", "contacted", "site_visit", "design_meeting", "estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"] as const;
const ACTIVITIES = ["call", "whatsapp", "meeting", "email", "note"] as const;

export function LeadActions({ leadId, canUpdate, canAddActivity }: { readonly leadId: string; readonly canUpdate: boolean; readonly canAddActivity: boolean }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent();
  const [stage, setStage] = useState<(typeof STAGES)[number]>("contacted"); const [activity, setActivity] = useState<(typeof ACTIVITIES)[number]>("call"); const [note, setNote] = useState(""); const [error, setError] = useState<string | null>(null);
  const stageMutation = useMutation({ mutationFn: () => context.runtime.api.authenticated.patch(`/leads/${encodeURIComponent(leadId)}`, { stage }), onSuccess: () => invalidate("project-initiated"), onError: (cause) => setError(cause instanceof ApiError ? cause.message : "The lead stage could not be updated.") });
  const activityMutation = useMutation({ mutationFn: () => context.runtime.api.authenticated.post(`/leads/${encodeURIComponent(leadId)}/activities`, { type: activity, note: note.trim(), occurredAt: new Date().toISOString() }), onSuccess: async () => { setNote(""); await invalidate("project-initiated"); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : "The activity could not be recorded.") });
  if (!canUpdate && !canAddActivity) return null;
  return <View style={styles.section}><Text accessibilityRole="header" style={styles.title}>Lead actions</Text>
    {canUpdate ? <><Text style={styles.label}>Pipeline stage</Text><View style={styles.options}>{STAGES.map((value) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: stage === value }} key={value} onPress={() => setStage(value)} style={[styles.option, stage === value ? styles.selected : null]}><Text style={[styles.optionText, stage === value ? styles.selectedText : null]}>{value.replaceAll("_", " ")}</Text></Pressable>)}</View><Button label="Update stage" loading={stageMutation.isPending} onPress={() => stageMutation.mutate()} /></> : null}
    {canAddActivity ? <><Text style={styles.label}>Activity type</Text><View style={styles.options}>{ACTIVITIES.map((value) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: activity === value }} key={value} onPress={() => setActivity(value)} style={[styles.option, activity === value ? styles.selected : null]}><Text style={[styles.optionText, activity === value ? styles.selectedText : null]}>{value}</Text></Pressable>)}</View><Field label="Activity note" value={note} onChangeText={setNote} multiline /><Button label="Add activity" loading={activityMutation.isPending} disabled={!note.trim()} onPress={() => activityMutation.mutate()} /></> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.sm }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20 }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 }, options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, option: { minHeight: 44, justifyContent: "center", borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, backgroundColor: colors.surface }, selected: { backgroundColor: colors.midnight }, optionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 11, textTransform: "capitalize" }, selectedText: { color: colors.surface }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 } });
