import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Image, Text, View, type GestureResponderEvent } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { TransferHttpError } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts } from "../../ui/tokens";
import { useProtectedDocument } from "../documents/useProtectedDocument";
import { KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { designPlanKeys } from "./designPlanApi";
import { cropWithinPage, type DesignCrop } from "./designPlanModel";

export function useDesignOwner(resourceId: string, session: AuthenticatedSession) {
  const context = useConfiguredRuntime();
  const key = `${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${resourceId}`;
  const current = useRef(key); current.current = key;
  useEffect(() => () => { current.current = ""; }, []);
  return { context, key, current, scope: { environmentId: context.environment.environment.id, userId: session.user.id } };
}
export function useDesignDraftGuard(dirty: boolean) {
  const navigationGuard = useScaffoldNavigationGuard();
  useEffect(() => { navigationGuard?.setBlocked(dirty); return () => navigationGuard?.setBlocked(false); }, [dirty, navigationGuard]);
}
export function isDesignDenied(cause: unknown) { return (cause instanceof ApiError || cause instanceof TransferHttpError) && [401, 403, 404].includes(cause.status); }
export function isDesignUncertain(cause: unknown) { return !((cause instanceof ApiError || cause instanceof TransferHttpError) && cause.status >= 400 && cause.status < 500 && cause.status !== 408); }
export function useDesignRefresh(session: AuthenticatedSession) {
  const context = useConfiguredRuntime(); const client = useQueryClient(); const invalidate = useInvalidateEvent();
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  return async () => { await Promise.all([client.invalidateQueries({ queryKey: designPlanKeys.all(scope) }), client.invalidateQueries({ queryKey: privateQueryKey(scope, "workflow") }), client.invalidateQueries({ queryKey: privateQueryKey(scope, "estimates") }), invalidate("design-workflow-changed")]); };
}
/** Retains the original operation closure for an explicitly requested safe retry. */
export function useDesignCommand(owner: ReturnType<typeof useDesignOwner>, onRefresh: () => Promise<unknown>, onDenied?: () => void) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [blocked, setBlocked] = useState(false); const [retryAvailable, setRetryAvailable] = useState(false);
  const pending = useRef(false); const blockedRef = useRef(blocked); blockedRef.current = blocked; const attempt = useRef<null | (() => Promise<unknown>)>(null); const success = useRef<null | ((result: unknown) => void)>(null);
  const navigationGuard = useScaffoldNavigationGuard();
  useEffect(() => { navigationGuard?.setBlocked(busy || blocked); return () => navigationGuard?.setBlocked(false); }, [busy, blocked, navigationGuard]);
  async function execute(operation: () => Promise<unknown>, replaySafe: boolean, after?: (result: unknown) => void) {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); const frozen = owner.key;
    try {
      const result = await operation(); if (owner.current.current !== frozen) return;
      attempt.current = null; success.current = null; setRetryAvailable(false); setBlocked(false); after?.(result);
      await onRefresh().catch(() => { if (owner.current.current === frozen) setError("The change was saved. Refresh to load the latest Design state."); });
    } catch (cause) {
      if (owner.current.current !== frozen) return;
      if (isDesignDenied(cause)) { attempt.current = null; success.current = null; setRetryAvailable(false); setBlocked(true); setError("This Design resource is unavailable for your current access."); onDenied?.(); }
      else if (isDesignUncertain(cause)) { setBlocked(true); attempt.current = replaySafe ? operation : null; success.current = after ?? null; setRetryAvailable(replaySafe); setError(replaySafe ? "The result could not be confirmed. Retry the same saved request to recover its result." : "The result could not be confirmed. Refresh and review the saved uploads or drawings before starting another change."); }
      else { attempt.current = null; success.current = null; setRetryAvailable(false); setBlocked(true); setError(cause instanceof ApiError && cause.status === 409 ? "This Design source changed. Refresh and reopen the current revision before saving." : cause instanceof ApiError || cause instanceof TransferHttpError ? cause.message : "The Design action failed."); }
    } finally { if (owner.current.current === frozen) { pending.current = false; setBusy(false); } }
  }
  return { busy, error, blocked, retryAvailable,
    run: (operation: () => Promise<unknown>, options: { replaySafe: boolean; after?: (result: unknown) => void }) => { if (!blockedRef.current) return execute(operation, options.replaySafe, options.after); return Promise.resolve(); },
    retry: () => attempt.current ? execute(attempt.current, true, success.current ?? undefined) : Promise.resolve(),
    reset: () => { if (!pending.current) { attempt.current = null; success.current = null; blockedRef.current = false; setRetryAvailable(false); setBlocked(false); setError(""); } }
  };
}
export function DesignCommandState({ command, onRefresh }: { readonly command: ReturnType<typeof useDesignCommand>; readonly onRefresh?: () => Promise<unknown> }) {
  return <>{command.error ? <KnowledgeText error>{command.error}</KnowledgeText> : null}{command.retryAvailable ? <Button label="Retry saved Design request" disabled={command.busy} onPress={() => void command.retry()} /> : null}{command.blocked && onRefresh ? <Button label="Refresh Design state" disabled={command.busy} onPress={() => void onRefresh().catch(() => undefined)} /> : null}</>;
}

export function NativeDesignCropEditor({ path, page, crop, onChange, disabled = false }: { readonly path: string; readonly page: { width: number; height: number }; readonly crop: DesignCrop; readonly onChange: (crop: DesignCrop) => void; readonly disabled?: boolean }) {
  const source = useProtectedDocument({ path, fileName: "design-source.png", mimeType: "image/png", kind: "plan-page" }, true);
  const [width, setWidth] = useState(280); const [move, setMove] = useState(false);
  const height = Math.min(360, width * page.height / page.width); const imageWidth = height * page.width / page.height; const offset = (width - imageWidth) / 2;
  const initial = useRef<{ x: number; y: number; crop: DesignCrop } | null>(null);
  const point = (event: GestureResponderEvent) => ({ x: Math.max(0, Math.min(page.width, Math.round((event.nativeEvent.locationX - offset) / imageWidth * page.width))), y: Math.max(0, Math.min(page.height, Math.round(event.nativeEvent.locationY / height * page.height))) });
  const valid = cropWithinPage(crop, page);
  return <View style={styles.stack}>
    <KnowledgeText>Drag to select the drawing area. Use coordinates for precise adjustments.</KnowledgeText>
    {source.status === "ready" && source.localUri ? <View accessibilityLabel="Design crop canvas" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height, width: "100%", backgroundColor: colors.surfaceMuted, overflow: "hidden" }} onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderGrant={event => { initial.current = { ...point(event), crop }; }} onResponderMove={event => {
      const start = initial.current; if (!start || disabled) return; const next = point(event);
      if (move) onChange({ ...start.crop, x: Math.max(0, Math.min(page.width - start.crop.width, start.crop.x + next.x - start.x)), y: Math.max(0, Math.min(page.height - start.crop.height, start.crop.y + next.y - start.y)) });
      else onChange({ x: Math.min(start.x, next.x, page.width - 1), y: Math.min(start.y, next.y, page.height - 1), width: Math.max(1, Math.abs(next.x - start.x)), height: Math.max(1, Math.abs(next.y - start.y)) });
    }} onResponderRelease={() => { initial.current = null; }} onResponderTerminate={() => { initial.current = null; }}>
      <Image accessible={false} source={{ uri: source.localUri }} resizeMode="contain" style={{ position: "absolute", width: imageWidth, height, left: offset }} />
      {valid ? <View pointerEvents="none" style={{ position: "absolute", left: offset + crop.x / page.width * imageWidth, top: crop.y / page.height * height, width: crop.width / page.width * imageWidth, height: crop.height / page.height * height, borderWidth: 2, borderColor: colors.primary, backgroundColor: "rgba(61,74,50,0.15)" }} /> : null}
    </View> : <><KnowledgeText>{source.error?.message ?? "Loading source page…"}</KnowledgeText>{source.error ? <Button label="Retry source image" onPress={source.retry} /> : null}</>}
    <View style={styles.row}><Button label={move ? "Draw new crop" : "Move selected crop"} variant="quiet" disabled={disabled || !valid} onPress={() => setMove(!move)} /><Button label="Use full page" variant="quiet" disabled={disabled} onPress={() => onChange({ x: 0, y: 0, width: page.width, height: page.height })} /></View>
    <View style={styles.row}>{(["x", "y", "width", "height"] as const).map(key => <View style={{ flex: 1, minWidth: 100 }} key={key}><Field label={`Crop ${key}`} value={String(crop[key])} keyboardType="number-pad" editable={!disabled} onChangeText={text => { if (/^\d{0,7}$/.test(text)) onChange({ ...crop, [key]: Number(text) }); }} /></View>)}</View>
    <Text style={{ color: valid ? colors.inkMuted : colors.danger, fontFamily: fonts.regular }}>{valid ? `Source page: ${page.width} × ${page.height} px` : "Keep the crop inside the source page with a positive width and height."}</Text>
  </View>;
}
