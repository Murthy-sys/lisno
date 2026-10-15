import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";
import { actOnDesignRequirement, getDesignRequirements, requirementValidation, type DesignRequirement, type DesignRequirementAction, type DesignRequirementCommand } from "./projectDesignRequirements";

const categories = { selection: "Physical Selection Sheet", critical: "Critical Designer Checklist", po_approval: "Designer PO Approval Checklist", stock: "Critical supply checks" } as const;
const statuses = { pending: "Pending", approved: "Approved", completed: "Completed", deferred: "During-project selection" } as const;
const actions = { complete: "Mark complete", approve: "Approve", defer: "Defer to during-project selection", reopen: "Reopen" } as const;
const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

export function ProjectDesignRequirementsPanel({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const client = useQueryClient(); const invalidate = useInvalidateEvent();
  const allowed = canPerformOperation(session, "GET /projects/:projectId/design-requirements");
  const key = privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "workflow", "design-requirements", projectId);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getDesignRequirements(context.runtime, projectId, signal), enabled: allowed, refetchInterval: 60_000 });
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<DesignRequirementCommand | null>(null);
  const data = denied(query.error) ? undefined : query.data;
  async function execute(command: DesignRequirementCommand): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const next = await actOnDesignRequirement(context.runtime, projectId, command);
      client.setQueryData(key, next); setRetry(null); setNotice("Design requirement updated.");
      await invalidate("design-workflow-changed");
      return true;
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408) {
        setRetry(command); setError("The update could not be confirmed. Retry the same saved action to recover its result.");
      } else {
        setRetry(null);
        setError(cause.status === 409 ? "These requirements changed. Review the refreshed state before acting again." : cause.message);
        if (denied(cause)) client.removeQueries({ queryKey: key });
        await query.refetch();
      }
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  if (!allowed) return null;
  return <View style={styles.panel} testID="project-design-requirements">
    <Text accessibilityRole="header" style={styles.title}>{data?.canReadInternal === false ? "Selections requiring your approval" : "Design requirements"}</Text>
    {query.isPending ? <BrandLoader label="Loading Design requirements" tone="dark" /> : null}
    {query.isError ? <View style={styles.stack}><Text accessibilityLiveRegion="assertive" style={styles.error}>{denied(query.error) ? "Design requirements are unavailable for this account." : "Requirements could not be refreshed. Actions are unavailable until the current state is loaded."}</Text><Button label="Retry requirements" variant="secondary" onPress={() => void query.refetch()} /></View> : null}
    {data ? <>
      {data.blockers.map((blocker) => <Text key={blocker} style={styles.warning}>{blocker}</Text>)}
      {data.entries.length === 0 ? <Text style={styles.copy}>No Design requirements apply to the current estimate.</Text> : null}
      {(Object.keys(categories) as (keyof typeof categories)[]).map((category) => {
        const entries = data.entries.filter((entry) => entry.category === category);
        return entries.length ? <View key={category} style={styles.stack}><Text accessibilityRole="header" style={styles.section}>{categories[category]}</Text>{entries.map((entry) => <RequirementRow key={`${entry.id}:${data.version}:${data.sourceToken}`} entry={entry} internal={data.canReadInternal} disabled={busy || query.isError || Boolean(retry)} onAction={(action, note, checkedPointIds) => execute({ expectedVersion: data.version, sourceToken: data.sourceToken, entryId: entry.id, action, note, checkedPointIds, idempotencyKey: createIdempotencyKey() })} />)}</View> : null;
      })}
    </> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    {retry && !denied(query.error) ? <Button label="Retry saved action" loading={busy} onPress={() => void execute(retry)} /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{notice}</Text> : null}
  </View>;
}

function RequirementRow({ entry, internal, disabled, onAction }: { readonly entry: DesignRequirement; readonly internal: boolean; readonly disabled: boolean; readonly onAction: (action: DesignRequirementAction, note: string, checked: string[]) => Promise<boolean> }) {
  const [open, setOpen] = useState(false); const [note, setNote] = useState("");
  const [checked, setChecked] = useState(entry.checkedPointIds); const [validation, setValidation] = useState("");
  async function act(action: DesignRequirementAction) {
    const issue = requirementValidation(entry, action, note, checked);
    if (issue) { setValidation(issue); return; }
    setValidation("");
    if (await onAction(action, note.trim(), action === "approve" && entry.category === "po_approval" ? checked : [])) setNote("");
  }
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${entry.lineName}, ${entry.label}, ${statuses[entry.status]}`} onPress={() => setOpen(!open)} style={styles.header}>
      <Text style={styles.name}>{entry.lineName}</Text><Text style={styles.copy}>{entry.label}</Text><Text style={styles.status}>{statuses[entry.status]} · {open ? "Hide details" : "View details"}</Text>
    </Pressable>
    {open ? <View style={styles.stack}>
      {entry.details ? <Text style={styles.copy}>{entry.details}</Text> : null}
      {entry.dueAt ? <Text style={styles.warning}>Due {new Date(entry.dueAt).toLocaleString()}</Text> : entry.category === "stock" ? <Text style={styles.copy}>The four-day deadline starts when initial payment is confirmed.</Text> : null}
      {entry.note ? <Text style={styles.copy}>Recorded note: {entry.note}</Text> : null}
      {entry.deferredReason ? <Text style={styles.copy}>During-project selection: {entry.deferredReason}</Text> : null}
      {entry.completedAt ? <Text style={styles.copy}>Recorded {new Date(entry.completedAt).toLocaleString()}</Text> : null}
      {internal ? entry.checklist.map((point) => <Pressable key={point.id} accessibilityRole="checkbox" accessibilityLabel={point.text} accessibilityState={{ checked: checked.includes(point.id), disabled: disabled || !entry.availableActions.includes("approve") }} disabled={disabled || !entry.availableActions.includes("approve")} onPress={() => setChecked((values) => values.includes(point.id) ? values.filter((value) => value !== point.id) : [...values, point.id])} style={styles.check}><View style={[styles.box, checked.includes(point.id) ? styles.checked : null]} /><Text style={[styles.copy, styles.flex]}>{point.text}</Text></Pressable>) : null}
      {entry.availableActions.length ? <><Field label="Evidence or decision note" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!disabled} />{entry.availableActions.map((action) => <Button key={action} label={actions[action]} disabled={disabled} variant={action === "approve" || action === "complete" ? "primary" : "secondary"} onPress={() => void act(action)} />)}</> : <Text style={styles.copy}>No action is available for your role at this stage.</Text>}
      {validation ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{validation}</Text> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stack: { gap: spacing.sm }, title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  section: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  row: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm, gap: spacing.sm },
  header: { minHeight: 52, gap: 4, paddingVertical: spacing.xs }, name: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  copy: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  status: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  warning: { fontFamily: fonts.medium, fontSize: 12, color: colors.warning }, error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  check: { minHeight: 48, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  box: { width: 22, height: 22, borderWidth: 1, borderColor: colors.primary }, checked: { backgroundColor: colors.primary }, flex: { flex: 1 }
});
