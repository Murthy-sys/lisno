import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { splitStableIds, validBudgetRange, validSchedule } from "./projectCreateModel";
import { ProjectCreationModal } from "./ProjectCreationModal";

interface Option { readonly id: string; readonly name: string; readonly email?: string }
interface Page<T> { readonly items: readonly T[] }
function failure(cause: unknown): string { return cause instanceof ApiError ? cause.message : "The project could not be created."; }

function ProjectCreationTrigger({ label, onPress, triggerRef, open }: { readonly label: string; readonly onPress: () => void; readonly triggerRef: RefObject<View | null>; readonly open: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Start a new project and bring your vision to life."
      accessibilityState={{ expanded: open }}
      accessibilityElementsHidden={open}
      importantForAccessibility={open ? "no-hide-descendants" : "auto"}
      disabled={open}
      ref={triggerRef}
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed ? styles.triggerPressed : null]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.triggerIcon}>
        <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
          <Path d="M12 5v14M5 12h14" fill="none" stroke={colors.primaryInk} strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={styles.triggerCopy}>
        <Text style={styles.triggerTitle}>{label}</Text>
        <Text style={styles.triggerDescription}>Start a new project and bring your vision to life.</Text>
      </View>
      <Svg width={18} height={22} viewBox="0 0 18 22" accessible={false}>
        <Path d="m6 6 5 5-5 5" fill="none" stroke={colors.primaryInk} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

function OptionPicker({ path, label, selected, onSelect, disabled }: { readonly path: string; readonly label: string; readonly selected: Option | null; readonly onSelect: (value: Option) => void; readonly disabled: boolean }) {
  const context = useConfiguredRuntime();
  const session = context.session.status === "authenticated" ? context.session.session : null;
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session?.user.id ?? "" }, "management", "project-option", path, search), queryFn: ({ signal }) => context.runtime.api.authenticated.get<Page<Option>>(`${path}?search=${encodeURIComponent(search.trim())}&limit=20&offset=0`, { signal }), enabled: Boolean(session) });
  return (
    <View style={styles.compact}>
      <Field label={`Search ${label}`} value={search} onChangeText={setSearch} autoCapitalize="none" editable={!disabled} />
      {selected ? <Text accessibilityLiveRegion="polite" style={styles.selectedCopy}>Selected: {selected.name}</Text> : null}
      {query.isPending ? <Text style={styles.copy}>Loading options…</Text> : query.isError ? <Text style={styles.error}>Options could not be loaded.</Text> : (
        <View accessibilityRole="radiogroup" style={styles.options}>
          {(query.data?.items ?? []).map((option) => (
            <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: selected?.id === option.id, disabled }} disabled={disabled} onPress={() => onSelect(option)} style={[styles.option, selected?.id === option.id ? styles.optionSelected : null]}>
              <Text style={[styles.optionTitle, selected?.id === option.id ? styles.optionTitleSelected : null]}>{option.name}</Text>
              {option.email ? <Text style={[styles.optionCopy, selected?.id === option.id ? styles.optionTitleSelected : null]}>{option.email}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function DesignerProjectCreate({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const submitting = useRef(false);
  const [manager, setManager] = useState<Option | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientMobile, setClientMobile] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [designerIds, setDesignerIds] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !location.trim() || !clientName.trim() || !clientEmail.trim() || !clientMobile.trim() || !clientAddress.trim() || !manager || !validSchedule(start, end)) throw new Error("Complete every required project, Client, manager and schedule field. The end must follow the start.");
      return context.runtime.api.authenticated.post("/projects", { name: name.trim(), clientName: clientName.trim(), clientEmail: clientEmail.trim(), clientMobile: clientMobile.trim(), clientAddress: clientAddress.trim(), assignedDesignerIds: splitStableIds(designerIds, session.user.id), managerId: manager.id, location: location.trim(), plannedStartAt: new Date(start).toISOString(), plannedEndAt: new Date(end).toISOString() });
    },
    onSuccess: async () => { setOpen(false); await invalidate("project-initiated"); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : failure(cause)),
    onSettled: () => { submitting.current = false; }
  });
  const close = () => { if (!submitting.current) setOpen(false); };
  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    mutation.mutate();
  };
  if (!canPerformOperation(session, "POST /projects")) return null;
  return (
    <>
      <ProjectCreationTrigger label="Create project" onPress={() => { if (!submitting.current) setOpen(true); }} triggerRef={triggerRef} open={open} />
      <ProjectCreationModal visible={open} title="Create project" description="The project includes Lisno’s design workflow and remains scoped to the assigned team." busy={mutation.isPending} onClose={close} triggerRef={triggerRef} footer={
        <>
        {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={close} /></View>
          <View style={styles.action}><Button label="Create project" loading={mutation.isPending} onPress={submit} /></View>
        </View>
        </>
      }>
        <Field label="Project name" value={name} onChangeText={setName} editable={!mutation.isPending} />
        <Field label="Location" value={location} onChangeText={setLocation} editable={!mutation.isPending} />
        <Field label="Client name" value={clientName} onChangeText={setClientName} editable={!mutation.isPending} />
        <Field label="Client email" value={clientEmail} onChangeText={setClientEmail} autoCapitalize="none" keyboardType="email-address" editable={!mutation.isPending} />
        <Field label="Client mobile" value={clientMobile} onChangeText={setClientMobile} keyboardType="phone-pad" editable={!mutation.isPending} />
        <Field label="Client address" value={clientAddress} onChangeText={setClientAddress} multiline editable={!mutation.isPending} />
        <OptionPicker path="/organization/managers" label="Design Manager" selected={manager} onSelect={setManager} disabled={mutation.isPending} />
        <Field label="Additional Designer IDs (optional)" value={designerIds} onChangeText={setDesignerIds} autoCapitalize="none" editable={!mutation.isPending} />
        <Field label="Planned start (ISO 8601)" value={start} onChangeText={setStart} editable={!mutation.isPending} />
        <Field label="Planned end (ISO 8601)" value={end} onChangeText={setEnd} editable={!mutation.isPending} />
      </ProjectCreationModal>
    </>
  );
}

export function AdminProjectInitiate({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const submitting = useRef(false);
  const salesManagerMode = session.user.role === "estimator_sales";
  const [assignee, setAssignee] = useState<Option | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientMobile, setClientMobile] = useState("");
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!clientName.trim() || !clientEmail.trim() || !clientMobile.trim() || !projectName.trim() || !location.trim() || !propertyType.trim() || !nextAction.trim() || !assignee || !validBudgetRange(budgetMin, budgetMax) || Number.isNaN(new Date(nextActionAt).getTime())) throw new Error("Complete every field, choose an active assignee, enter a valid budget range and next-action time.");
      return context.runtime.api.authenticated.post("/admin/projects", { clientName: clientName.trim(), clientEmail: clientEmail.trim(), clientMobile: clientMobile.trim(), projectName: projectName.trim(), location: location.trim(), propertyType: propertyType.trim(), budgetMin: Number(budgetMin), budgetMax: Number(budgetMax), nextAction: nextAction.trim(), nextActionAt: new Date(nextActionAt).toISOString(), ...(salesManagerMode ? { salesManagerId: assignee.id } : { estimatorId: assignee.id }) });
    },
    onSuccess: async () => { setOpen(false); await invalidate("project-initiated"); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : failure(cause)),
    onSettled: () => { submitting.current = false; }
  });
  const close = () => { if (!submitting.current) setOpen(false); };
  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    mutation.mutate();
  };
  if (!canPerformOperation(session, "POST /admin/projects")) return null;
  return (
    <>
      <ProjectCreationTrigger label="Initiate project" onPress={() => { if (!submitting.current) setOpen(true); }} triggerRef={triggerRef} open={open} />
      <ProjectCreationModal visible={open} title="Initiate project" description="Create the project and assign its Sales handoff." busy={mutation.isPending} onClose={close} triggerRef={triggerRef} footer={
        <>
        {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={close} /></View>
          <View style={styles.action}><Button label="Initiate" loading={mutation.isPending} onPress={submit} /></View>
        </View>
        </>
      }>
        <Field label="Project / property name" value={projectName} onChangeText={setProjectName} editable={!mutation.isPending} />
        <Field label="Property type" value={propertyType} onChangeText={setPropertyType} editable={!mutation.isPending} />
        <Field label="Location" value={location} onChangeText={setLocation} editable={!mutation.isPending} />
        <Field label="Client name" value={clientName} onChangeText={setClientName} editable={!mutation.isPending} />
        <Field label="Client email" value={clientEmail} onChangeText={setClientEmail} autoCapitalize="none" keyboardType="email-address" editable={!mutation.isPending} />
        <Field label="Client mobile" value={clientMobile} onChangeText={setClientMobile} keyboardType="phone-pad" editable={!mutation.isPending} />
        <Field label="Minimum budget" value={budgetMin} onChangeText={setBudgetMin} keyboardType="decimal-pad" editable={!mutation.isPending} />
        <Field label="Maximum budget" value={budgetMax} onChangeText={setBudgetMax} keyboardType="decimal-pad" editable={!mutation.isPending} />
        <Field label="Next action" value={nextAction} onChangeText={setNextAction} editable={!mutation.isPending} />
        <Field label="Next action time (ISO 8601)" value={nextActionAt} onChangeText={setNextActionAt} editable={!mutation.isPending} />
        <OptionPicker path={salesManagerMode ? "/admin/sales-managers" : "/admin/estimators"} label={salesManagerMode ? "Sales Manager" : "Sales user"} selected={assignee} onSelect={setAssignee} disabled={mutation.isPending} />
      </ProjectCreationModal>
    </>
  );
}

export function ProjectCreateAction({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const owner = `${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${session.user.role}`;
  if (context.session.status !== "authenticated" || context.session.session?.user.id !== session.user.id) return null;
  if (session.user.role === "designer") {
    return canPerformOperation(session, "POST /projects")
      ? <DesignerProjectCreate key={owner} session={session} />
      : null;
  }
  return canPerformOperation(session, "POST /admin/projects")
    ? <AdminProjectInitiate key={owner} session={session} />
    : null;
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primary
  },
  triggerPressed: { backgroundColor: colors.primaryPressed },
  triggerIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238,240,230,0.16)"
  },
  triggerCopy: { flex: 1, minWidth: 0, gap: 1 },
  triggerTitle: { color: colors.primaryInk, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  triggerDescription: { color: colors.shellInk, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14 },
  compact: { gap: spacing.sm }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, selectedCopy: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, options: { gap: spacing.xs }, option: { minHeight: 48, justifyContent: "center", padding: spacing.sm, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border }, optionSelected: { backgroundColor: colors.midnight, borderColor: colors.midnight }, optionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13 }, optionTitleSelected: { color: colors.surface }, optionCopy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 } });
