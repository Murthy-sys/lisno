import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

const STAGE_TYPES = ["internal_kickoff", "client_kickoff", "key_collection", "site_measurement", "existing_furniture_dimensions", "space_planning_tentative_look_feel", "concept_mood_board", "floor_plan", "client_revisions", "final_approval", "design_handoff"] as const;
function iso(value: string): string | null { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

function CreatePanel({ label, open, pending, error, onOpen, onCancel, onSave, children }: { readonly label: string; readonly open: boolean; readonly pending: boolean; readonly error: string | null; readonly onOpen: () => void; readonly onCancel: () => void; readonly onSave: () => void; readonly children: ReactNode }) {
  if (!open) return <Button label={label} variant="quiet" onPress={onOpen} />;
  return <View style={styles.form}>{children}{error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}<View style={styles.actions}><View style={styles.action}><Button label="Cancel" variant="quiet" disabled={pending} onPress={onCancel} /></View><View style={styles.action}><Button label="Save" loading={pending} onPress={onSave} /></View></View></View>;
}

function useCreate(path: string, body: () => Record<string, unknown>, close: () => void, validate: () => string | null) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent(); const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: () => { const validation = validate(); if (validation) throw new Error(validation); return context.runtime.api.authenticated.post(path, body()); }, onSuccess: async () => { close(); setError(null); await invalidate("task-changed"); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The record could not be created.") });
  return { mutation, error, clear: () => setError(null) };
}

export function FloorCreateAction({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [number, setNumber] = useState(""); const [order, setOrder] = useState("0"); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const state = useCreate(`/projects/${encodeURIComponent(projectId)}/floors`, () => ({ name: name.trim(), number: number.trim(), order: Number(order), plannedStartAt: iso(start), plannedEndAt: iso(end) }), () => setOpen(false), () => !name.trim() || !number.trim() || !Number.isInteger(Number(order)) || Number(order) < 0 || !iso(start) || !iso(end) ? "Enter a name, number, non-negative order, and valid planned dates." : new Date(end) < new Date(start) ? "The planned end must follow the start." : null);
  if (!canPerformOperation(session, "POST /projects/:projectId/floors")) return null;
  return <CreatePanel label="Add floor" open={open} pending={state.mutation.isPending} error={state.error} onOpen={() => { setOpen(true); state.clear(); }} onCancel={() => setOpen(false)} onSave={() => state.mutation.mutate()}><Text style={styles.title}>Add floor</Text><Field label="Floor name" value={name} onChangeText={setName} /><Field label="Floor number" value={number} onChangeText={setNumber} /><Field label="Order" value={order} onChangeText={setOrder} keyboardType="number-pad" /><Field label="Planned start (ISO 8601)" value={start} onChangeText={setStart} /><Field label="Planned end (ISO 8601)" value={end} onChangeText={setEnd} /></CreatePanel>;
}

export function StageCreateAction({ floorId, session }: { readonly floorId: string; readonly session: AuthenticatedSession }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [type, setType] = useState<(typeof STAGE_TYPES)[number]>("concept_mood_board"); const [order, setOrder] = useState("0");
  const state = useCreate(`/floors/${encodeURIComponent(floorId)}/stages`, () => ({ name: name.trim(), type, order: Number(order) }), () => setOpen(false), () => !name.trim() || !Number.isInteger(Number(order)) || Number(order) < 0 ? "Enter a stage name and non-negative order." : null);
  if (!canPerformOperation(session, "POST /floors/:floorId/stages")) return null;
  return <CreatePanel label="Add stage" open={open} pending={state.mutation.isPending} error={state.error} onOpen={() => { setOpen(true); state.clear(); }} onCancel={() => setOpen(false)} onSave={() => state.mutation.mutate()}><Text style={styles.title}>Add stage</Text><Field label="Stage name" value={name} onChangeText={setName} /><Field label="Order" value={order} onChangeText={setOrder} keyboardType="number-pad" /><Text style={styles.label}>Stage type</Text><View accessibilityRole="radiogroup" style={styles.options}>{STAGE_TYPES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: type === value }} onPress={() => setType(value)} style={[styles.option, type === value ? styles.selected : null]}><Text style={[styles.optionText, type === value ? styles.selectedText : null]}>{value.replaceAll("_", " ")}</Text></Pressable>)}</View></CreatePanel>;
}

export function TaskCreateAction({ stageId, session }: { readonly stageId: string; readonly session: AuthenticatedSession }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [ownerId, setOwnerId] = useState(""); const [order, setOrder] = useState("0"); const [start, setStart] = useState(""); const [deadline, setDeadline] = useState(""); const [effort, setEffort] = useState("");
  const state = useCreate(`/stages/${encodeURIComponent(stageId)}/tasks`, () => ({ title: title.trim(), ownerId: ownerId.trim(), order: Number(order), plannedStartAt: iso(start), originalDeadlineAt: iso(deadline), ...(effort.trim() ? { plannedEffort: Number(effort) } : {}) }), () => setOpen(false), () => !title.trim() || !ownerId.trim() || !Number.isInteger(Number(order)) || Number(order) < 0 || !iso(start) || !iso(deadline) || (effort.trim() && (!Number.isFinite(Number(effort)) || Number(effort) <= 0)) ? "Enter a title, stable owner ID, non-negative order, valid dates, and optional positive effort." : new Date(deadline) < new Date(start) ? "The deadline must follow the planned start." : null);
  if (!canPerformOperation(session, "POST /stages/:stageId/tasks")) return null;
  return <CreatePanel label="Add task" open={open} pending={state.mutation.isPending} error={state.error} onOpen={() => { setOpen(true); state.clear(); }} onCancel={() => setOpen(false)} onSave={() => state.mutation.mutate()}><Text style={styles.title}>Add task</Text><Field label="Task title" value={title} onChangeText={setTitle} /><Field label="Owner user ID" value={ownerId} onChangeText={setOwnerId} autoCapitalize="none" /><Field label="Order" value={order} onChangeText={setOrder} keyboardType="number-pad" /><Field label="Planned start (ISO 8601)" value={start} onChangeText={setStart} /><Field label="Original deadline (ISO 8601)" value={deadline} onChangeText={setDeadline} /><Field label="Planned effort (optional)" value={effort} onChangeText={setEffort} keyboardType="decimal-pad" /></CreatePanel>;
}

const styles = StyleSheet.create({ form: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 }, options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, option: { minHeight: 42, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill }, selected: { backgroundColor: colors.midnight }, optionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 10, textTransform: "capitalize" }, selectedText: { color: colors.surface } });
