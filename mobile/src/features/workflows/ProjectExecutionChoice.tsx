import { useEffect, useRef, useState } from "react";
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  isExecutionChoiceView,
  type ExecutionChoiceCommand,
  type ExecutionChoiceOption,
  type ExecutionChoiceOptionId,
  type ExecutionChoicePhase
} from "../../../../shared/projects/executionChoice";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";

interface Props {
  readonly projectId: string;
  readonly session: AuthenticatedSession;
  readonly projection: unknown;
  readonly refreshing?: boolean;
  readonly refreshError?: boolean;
  readonly refresh: () => Promise<void>;
  /** Purge the complete scoped workflow, cancel older reads, then revalidate access. */
  readonly onAccessDenied: () => Promise<void>;
}

interface Confirmation {
  readonly option: ExecutionChoiceOption;
  readonly version: number;
  readonly stageId: string;
}

const denied = (cause: unknown) => cause instanceof ApiError && [401, 403, 404].includes(cause.status);

/** The identity key also discards drafts after reauthentication into the same account. */
export function ProjectExecutionChoice(props: Props) {
  const context = useConfiguredRuntime();
  if (context.session.status !== "authenticated" || context.session.session?.user.id !== props.session.user.id ||
    !props.session.authorization.permissions.includes("projects.design_workflow.read")) return null;
  const identity = [context.environment.environment.id, context.environment.generation, context.session.generation,
    props.session.user.id, props.session.user.role, props.projectId].join(":");
  return <ExecutionChoiceContent key={identity} {...props} />;
}

function PhaseSequence({ phases }: { readonly phases: readonly ExecutionChoicePhase[] }) {
  return <View style={styles.sequence}>{phases.map((phase, index) =>
    <Text key={phase.id} style={styles.copy}>{index + 1}. {phase.label}</Text>
  )}</View>;
}

function ExecutionChoiceContent({ projectId, session, projection, refreshing = false, refreshError = false, refresh, onAccessDenied }: Props) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const guard = useScaffoldNavigationGuard();
  const view = isExecutionChoiceView(projection) ? projection : null;
  const [selected, setSelected] = useState<ExecutionChoiceOptionId | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [retry, setRetry] = useState<ExecutionChoiceCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const saved = view?.status === "locked" ? view.selection : null;
  useEffect(() => {
    if (!saved) return;
    setConfirmation(null); setRetry(null); setCommitted(false); setSelected(null);
  }, [saved]);

  const navigationLocked = Boolean(confirmation || busy || retry || committed && !saved);
  useEffect(() => {
    guard?.setBlocked(navigationLocked);
    const subscription = navigationLocked ? BackHandler.addEventListener("hardwareBackPress", () => true) : null;
    return () => { subscription?.remove(); guard?.setBlocked(false); };
  }, [guard, navigationLocked]);

  const personal = session.user.role === "client" && session.authorization.permissions.includes("projects.design_workflow.act");
  const canSelect = Boolean(view?.status === "available" && view.canSelect && view.keyCollectionStageId && personal && !accessLost);
  const disabled = busy || refreshBusy || refreshing || refreshError || Boolean(retry) || committed;
  const staleConfirmation = Boolean(confirmation && (!canSelect || view?.version !== confirmation.version || view.keyCollectionStageId !== confirmation.stageId));

  async function refreshState() {
    if (refreshBusy) return;
    setRefreshBusy(true);
    try { await refresh(); }
    catch (cause) {
      if (!active.current) return;
      if (denied(cause)) setAccessLost(true);
      setError("The latest execution choice could not be loaded. Refresh again before making a new choice.");
    } finally { if (active.current) setRefreshBusy(false); }
  }

  async function execute(command: ExecutionChoiceCommand) {
    if (inFlight.current || accessLost) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await context.runtime.api.authenticated.post<{ version: number }>(
        `/projects/${encodeURIComponent(projectId)}/design-workflow/actions`, command
      );
      if (!response || !Number.isSafeInteger(response.version) || response.version < 1) throw new ApiProtocolError();
      if (!active.current) return;
      setRetry(null); setCommitted(true); setConfirmation(null);
      await invalidate("design-workflow-changed").catch(() => undefined);
      if (active.current) await refreshState();
    } catch (cause) {
      if (!active.current) return;
      if (!(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408) {
        setRetry(command);
        setError("The save result could not be confirmed. Retry the same execution choice to recover its result.");
      } else {
        setRetry(null); setConfirmation(null);
        if (denied(cause)) {
          setAccessLost(true);
          try {
            await onAccessDenied();
            if (active.current) { setAccessLost(false); setSelected(null); }
          } catch {
            if (active.current) setError("The project workflow could not be revalidated. Retry the workflow to check your access.");
          }
          return;
        }
        setError(cause.status === 409
          ? "The workflow changed. Review the refreshed execution choice before confirming again."
          : cause.message);
        await refreshState();
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  function openConfirmation() {
    const option = view?.options.find(candidate => candidate.id === selected);
    if (!canSelect || disabled || !view?.keyCollectionStageId || !option) return;
    setError("");
    setConfirmation({ option, version: view.version, stageId: view.keyCollectionStageId });
  }

  function confirm() {
    if (!confirmation || disabled || staleConfirmation || !canSelect) return;
    void execute({ action: "execution_path_select", expectedVersion: confirmation.version,
      stageId: confirmation.stageId, idempotencyKey: createIdempotencyKey(),
      data: { optionId: confirmation.option.id, definitionVersion: confirmation.option.definitionVersion, acknowledgedIrreversible: true } });
  }

  function closeConfirmation() {
    if (!busy && !retry) setConfirmation(null);
  }

  if (accessLost) return <View style={styles.section}><Text accessibilityRole="header" style={styles.title}>Execution choice</Text>
    <Text accessibilityLiveRegion="assertive" style={styles.error}>Execution choice is unavailable for this account.</Text>
  </View>;

  return <View style={styles.section} testID="project-execution-choice">
    <Text accessibilityRole="header" style={styles.title}>Execution choice</Text>
    {saved ? <>
      <Text accessibilityLiveRegion="polite" style={styles.saved}>Saved permanently</Text>
      <Text style={styles.optionTitle}>{saved.optionLabel}</Text>
      <Text style={styles.copy}>Planned sequence</Text>
      <PhaseSequence phases={saved.phases} />
      <Text style={styles.copy}>Saved {new Date(saved.selectedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text>
    </> : committed ? <>
      <Text accessibilityLiveRegion="polite" style={styles.saved}>Saved permanently</Text>
      <Text style={styles.copy}>Your choice was saved. Refresh to view the confirmed sequence and saved time.</Text>
      <Button label="Refresh saved choice" variant="secondary" loading={refreshBusy} disabled={busy} onPress={() => void refreshState()} />
    </> : !view ? <Text style={styles.copy}>Execution choice is unavailable. Refresh the workflow to load the current options.</Text>
      : view.status === "waiting_for_keys" ? <Text style={styles.copy}>Available after you and your Designer confirm key collection.</Text>
        : view.status === "unavailable" ? <Text style={styles.copy}>{view.blockingReason ?? "Execution choice is unavailable for this project."}</Text>
          : !canSelect ? <Text style={styles.copy}>Awaiting Client selection</Text>
            : <>
              <Text style={styles.copy}>Choose the planned sequence for your project. Review both options before saving.</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Execution options">
                {view.options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label}
                  accessibilityHint={option.phases.map(phase => phase.label).join(", then ")}
                  accessibilityState={{ checked: selected === option.id, disabled }} disabled={disabled}
                  onPress={() => { setSelected(option.id); setError(""); }} style={styles.option}>
                  <View style={styles.optionHeading}><View accessible={false} style={[styles.radio, selected === option.id && styles.radioSelected]} />
                    <Text style={styles.optionTitle}>{option.label}</Text></View>
                  <PhaseSequence phases={option.phases} />
                </Pressable>)}
              </View>
              <Button label="Save execution choice" disabled={disabled || !selected} onPress={openConfirmation} />
            </>}
    {refreshError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>The workflow could not be refreshed. Saved information remains visible; new choices are unavailable until refresh succeeds.</Text> : null}
    {error && !confirmation ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    {retry && !confirmation ? <Button label="Retry saved execution choice" loading={busy} disabled={refreshBusy} onPress={() => void execute(retry)} /> : null}
    {confirmation ? <Modal visible transparent animationType="none" onRequestClose={closeConfirmation}>
      <View style={styles.scrim}><View accessibilityViewIsModal style={styles.modal}>
        <ScrollView contentContainerStyle={styles.confirmation} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>Confirm execution choice</Text>
          <Text style={styles.optionTitle}>{confirmation.option.label}</Text>
          <PhaseSequence phases={confirmation.option.phases} />
          <Text style={styles.warning}>Once saved, this choice cannot be changed or revoked.</Text>
          {staleConfirmation && !retry ? <Text accessibilityLiveRegion="assertive" style={styles.error}>The workflow changed. Go back and review the latest state before saving.</Text> : null}
          {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
          {retry ? <Button label="Retry saved execution choice" loading={busy} disabled={refreshBusy} onPress={() => void execute(retry)} />
            : <Button label="Save permanently" loading={busy} disabled={disabled || staleConfirmation} onPress={confirm} />}
          <Button label="Go back" variant="quiet" disabled={busy || Boolean(retry)} onPress={closeConfirmation} />
        </ScrollView>
      </View></View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { paddingVertical: spacing.md, borderTopWidth: 1, borderColor: colors.border, gap: spacing.sm, minWidth: 0 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26 },
  optionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22, flexShrink: 1 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, flexShrink: 1 },
  sequence: { gap: spacing.xxs, minWidth: 0 },
  option: { paddingVertical: spacing.md, gap: spacing.xs, borderBottomWidth: 1, borderColor: colors.border },
  optionHeading: { flexDirection: "row", gap: spacing.sm, alignItems: "center", minHeight: 32 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary },
  radioSelected: { backgroundColor: colors.primary },
  saved: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22 },
  warning: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, lineHeight: 23 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 21 },
  scrim: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(24,32,22,0.65)" },
  modal: { width: "100%", maxWidth: 640, maxHeight: "92%", alignSelf: "center", padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  confirmation: { gap: spacing.md }
});
