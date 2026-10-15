import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { pickDocument, releaseSelectedAsset, type SelectedAsset } from "../../platform/files";
import { Button } from "../../ui/primitives";
import { KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { createIdempotencyKey } from "../finance/money";
import { designFilePolicy, replaceDesignDrawing, replacePlanRequest, uploadDesign } from "./designPlanApi";
import { DesignCommandState, useDesignCommand, useDesignDraftGuard, useDesignOwner } from "./DesignPlanControls";
export type DesignUploadTarget = { kind: "ordinary" } | { kind: "drawing"; drawingId: string; version: number } | { kind: "request"; requestId: string; version: number };
export function DesignFileUpload({ estimateId, target, session, disabled = false, label = "Upload design plan", onChanged, onDenied, onLockChange }: { readonly estimateId: string; readonly target: DesignUploadTarget; readonly session: AuthenticatedSession; readonly disabled?: boolean; readonly label?: string; readonly onChanged: () => Promise<unknown>; readonly onDenied?: () => void; readonly onLockChange?: (locked: boolean) => void }) {
  const owner = useDesignOwner(estimateId, session); const [asset, setAsset] = useState<SelectedAsset | null>(null); const file = useRef<SelectedAsset | null>(null); const controller = useRef<AbortController | null>(null); const [progress, setProgress] = useState<number | null>(null); const [selectionError, setSelectionError] = useState(""); const [notice, setNotice] = useState(""); const key = useRef(createIdempotencyKey());
  const command = useDesignCommand(owner, onChanged, onDenied);
  useDesignDraftGuard(asset !== null);
  useEffect(() => { onLockChange?.(command.busy || command.blocked); return () => onLockChange?.(false); }, [command.busy, command.blocked, onLockChange]);
  useEffect(() => () => { controller.current?.abort(); if (file.current) void releaseSelectedAsset(file.current); }, []);
  async function choose() {
    const frozen = owner.key;
    try { const result = await pickDocument(designFilePolicy); if (result.status !== "selected") return; if (owner.current.current !== frozen) { void releaseSelectedAsset(result.asset); return; } if (file.current) void releaseSelectedAsset(file.current); file.current = result.asset; setAsset(result.asset); key.current = createIdempotencyKey(); setSelectionError(""); setNotice(""); command.reset(); }
    catch { if (owner.current.current === frozen) setSelectionError("The file could not be selected. Choose a PDF or supported image up to 25 MB."); }
  }
  function clear() { if (file.current) void releaseSelectedAsset(file.current); file.current = null; setAsset(null); }
  async function send() {
    if (!asset || disabled || command.busy) return;
    const selected = asset; const captured = target; const attemptKey = key.current; const frozen = owner.key; const updateProgress = (fraction: number | null) => { if (owner.current.current === frozen) setProgress(fraction); }; setNotice("");
    await command.run(async () => {
      controller.current = new AbortController(); setProgress(0);
      try {
        return captured.kind === "ordinary" ? await uploadDesign(owner.context.runtime, estimateId, selected, updateProgress, controller.current.signal)
          : captured.kind === "drawing" ? await replaceDesignDrawing(owner.context.runtime, estimateId, captured.drawingId, captured.version, selected, updateProgress, controller.current.signal)
            : await replacePlanRequest(owner.context.runtime, estimateId, captured.requestId, captured.version, attemptKey, selected, updateProgress, controller.current.signal);
      } finally { controller.current = null; updateProgress(null); }
    }, { replaySafe: captured.kind !== "ordinary", after: () => { clear(); setNotice("File saved. Drawing extraction and matching will update below."); } });
  }
  return <View style={styles.stack}>
    <KnowledgeText>PDF, PNG, JPEG, WebP, TIFF or HEIC. Maximum 25 MB.</KnowledgeText>
    <Button label={asset ? `Selected: ${asset.name}` : "Choose design file"} variant="secondary" disabled={disabled || command.busy || command.blocked} onPress={() => void choose()} />
    {asset ? <View style={styles.row}><Button label={label} loading={command.busy} disabled={disabled || command.blocked} onPress={() => void send()} /><Button label="Clear selected design" variant="quiet" disabled={command.busy || command.retryAvailable} onPress={clear} /></View> : null}
    {progress !== null ? <KnowledgeText>{progress >= 1 ? "Upload complete. Processing…" : `Uploading ${Math.round(progress * 100)}%`}</KnowledgeText> : null}
    {selectionError ? <KnowledgeText error>{selectionError}</KnowledgeText> : null}{notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
    <DesignCommandState command={command} onRefresh={async () => { await onChanged(); command.reset(); clear(); }} />
  </View>;
}
