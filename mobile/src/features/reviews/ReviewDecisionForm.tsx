import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import { pickDocument, releaseSelectedAsset, type SelectedAsset } from "../../platform/files";
import { Button, CommandState, Copy, denied, Field, Panel, Select, useDraftGuard, useNativeCommand, type NativeContext } from "../admin/nativeWorkspace";
import { designReviewSchema, estimateReviewDetailSchema, sameReviewSource, type Review, type ReviewKind } from "./reviewModel";
import { z } from "zod";

const POLICY = { acceptedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], maxBytes: 25 * 1024 * 1024 } as const;
export function ReviewDecisionForm({ context: c, kind, task, current, onReload, onDenied, externalLock = false, onLockedChange }: { context: NativeContext; kind: ReviewKind; task: Review; current: boolean; onReload: () => Promise<unknown>; onDenied?: () => void; externalLock?: boolean; onLockedChange?: (locked: boolean) => void }) {
  const [decision, setDecision] = useState<"approve" | "request_changes">("approve"); const [note, setNote] = useState("");
  const [proof, setProof] = useState<SelectedAsset | null>(null); const [progress, setProgress] = useState<number | null>(null); const [picking, setPicking] = useState(false);
  const retained = useRef<SelectedAsset | null>(null); const alive = useRef(true); const [basis, setBasis] = useState(task);
  const command = useNativeCommand(async () => { await onReload(); await c.refresh(); });
  const stale = !current || task.version !== basis.version;
  const blocked = stale || command.locked || picking || externalLock;
  const close = useDraftGuard(Boolean(proof || note || decision !== "approve"), command.locked || picking, c);
  const operation = kind === "estimate" ? "POST /admin/estimate-client-response-tasks/:roundId/decision" : "POST /admin/design-plan-response-tasks/:roundId/decision";
  const allowed = c.can(operation) && task.status === "pending" && (!("canDecide" in task) || task.canDecide !== false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (retained.current) void releaseSelectedAsset(retained.current).catch(() => undefined); }; }, []);
  useEffect(() => { if (command.accessLost) onDenied?.(); }, [command.accessLost, onDenied]);
  useEffect(() => { onLockedChange?.(command.locked || picking); return () => onLockedChange?.(false); }, [command.locked, picking, onLockedChange]);
  function retain(next: SelectedAsset | null) { const old = retained.current; retained.current = next; setProof(next); if (old && old !== next) void releaseSelectedAsset(old).catch(() => undefined); }
  async function choose() {
    if (blocked) return; setPicking(true);
    try { const result = await pickDocument(POLICY); if (result.status === "selected") { if (alive.current) retain(result.asset); else await releaseSelectedAsset(result.asset); } }
    catch (error) { if (alive.current) command.validation(error instanceof Error ? error.message : "Proof could not be selected."); }
    finally { if (alive.current) setPicking(false); }
  }
  async function reload() {
    if (command.busy || command.unknown) return;
    try {
      const latest = kind === "estimate" ? estimateReviewDetailSchema.parse(await c.http.get(`/admin/estimate-client-response-tasks/${encodeURIComponent(task.id)}`)) : z.array(designReviewSchema).parse(await c.http.get("/admin/design-plan-response-tasks")).find(value => value.id === task.id);
      if (!latest || !sameReviewSource(latest, task)) throw new Error("The current review source could not be verified.");
      retain(null); setNote(""); setDecision("approve"); setBasis(latest); await onReload(); await command.reload();
    } catch (error) { if (denied(error)) onDenied?.(); command.validation(error instanceof Error ? error.message : "The review could not be loaded."); }
  }
  function save() {
    if (!allowed || blocked) return;
    if (!proof) { command.validation("Upload proof of the Client's decision."); return; }
    if (decision === "request_changes" && !note.trim()) { command.validation("Explain the Client's requested changes."); return; }
    const pinned = basis; const path = kind === "estimate" ? `/admin/estimate-client-response-tasks/${encodeURIComponent(pinned.id)}` : `/admin/design-plan-response-tasks/${encodeURIComponent(pinned.id)}`;
    const parameters = kind === "estimate" ? { decision, note: note.trim(), version: String(pinned.version) } : { decision, note: note.trim(), expectedVersion: String(pinned.version) };
    const asset = proof;
    void command.execute(async () => {
      // Verify scope and CAS again immediately before sending private proof.
      const latest = kind === "estimate" ? estimateReviewDetailSchema.parse(await c.http.get(path)) : z.array(designReviewSchema).parse(await c.http.get("/admin/design-plan-response-tasks")).find(value => value.id === pinned.id);
      if (!latest || !sameReviewSource(latest, pinned) || latest.version !== pinned.version || latest.status !== "pending" || ("canDecide" in latest && latest.canDecide === false)) throw new ApiError(409, "REVIEW_STALE", "This review changed. Load the current review and select fresh proof.");
      const response = await c.transfers.upload({ path: `${path}/decision`, fileUri: asset.uri, fileName: asset.name, mimeType: asset.mimeType, fieldName: "proof", parameters, maxBytes: POLICY.maxBytes, onProgress: value => { if (alive.current) setProgress(value.fraction); } }).result;
      if (kind === "design") { const saved = designReviewSchema.parse(response); if (!sameReviewSource(saved, pinned) || saved.version <= pinned.version || saved.status !== (decision === "approve" ? "approved" : "changes_requested")) throw new Error("The saved review result could not be verified."); }
      else { const saved = z.object({ estimate: z.object({ id: z.string() }), clientReview: z.object({ id: z.literal(pinned.id), version: z.number().int().gt(pinned.version), status: z.enum(["approved", "changes_requested"]) }) }).parse(response); if (!("estimate" in pinned) || saved.estimate.id !== pinned.estimate.id || saved.clientReview.status !== (decision === "approve" ? "approved" : "changes_requested")) throw new Error("The saved review decision could not be verified."); }
    }, () => { retain(null); setNote(""); setProgress(null); });
  }
  if (command.accessLost) return <Copy error>This review is no longer available for your account.</Copy>;
  if (!allowed && !command.locked) return <Copy>{task.status === "pending" ? "Awaiting the Client's response." : "This response is recorded in immutable history."}</Copy>;
  return <Panel title="Record Client response"><Copy>Record the Client's decision on the submitted version with supporting proof.</Copy>{stale ? <Copy error>This review changed. Reload and review the current documents before choosing fresh proof.</Copy> : null}<Select label="Client decision" value={decision} options={[{ value: "approve", label: "Approve" }, { value: "request_changes", label: "Request changes" }]} onChange={value => setDecision(value as typeof decision)} disabled={blocked || !allowed} /><Field label={decision === "request_changes" ? "Requested changes" : "Decision note"} value={note} onChangeText={setNote} multiline maxLength={1000} editable={!blocked && allowed} /><Button label={proof ? `Proof: ${proof.name}` : "Choose Client decision proof"} variant="secondary" disabled={blocked || !allowed} onPress={() => void choose()} />{progress !== null ? <Copy>{progress >= 1 ? "Proof uploaded. Recording the decision…" : `Uploading proof ${Math.round(progress * 100)}%`}</Copy> : null}<Button label="Record decision" disabled={blocked || !allowed} loading={command.busy} onPress={save} /><Button label="Discard decision draft" variant="quiet" disabled={command.locked || picking} onPress={() => close(() => { retain(null); setNote(""); setDecision("approve"); })} /><CommandState command={{ ...command, reload }} />{stale && !command.conflict ? <Button label="Reload review and clear proof" variant="secondary" disabled={command.locked || picking} onPress={() => close(() => void reload())} /> : null}</Panel>;
}
