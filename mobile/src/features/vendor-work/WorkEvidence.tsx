import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image, Text, View } from "react-native";
import { Button } from "../../ui/primitives";
import { capturePhoto, pickImage, recoverPendingImageSelection, releaseSelectedAsset, type DownloadedArtifact, type SelectedAsset } from "../../platform/files";
import { createIdempotencyKey } from "../finance/money";
import { AccessLost, CommandFeedback, p, Panel, ScopeMismatch, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "../execution/executionNative";
import { workImagePath, workUploadPath } from "./vendorWorkApi";
import type { VendorWorkTask } from "./vendorWorkTypes";

const imagePolicy = { acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 12_000_000 };
export function WorkEvidence({ context: c, projectId, assignmentId, imageIds, canUpload = false }: { context: DeliveryContext; projectId: string; assignmentId: string; imageIds: string[]; canUpload?: boolean }) {
  const [viewing, setViewing] = useState<string | null>(null); const [asset, setAsset] = useState<SelectedAsset | null>(null); const [progress, setProgress] = useState<number | null>(null); const [selecting, setSelecting] = useState(false);
  const allowed = canUpload && c.can("POST /vendor/work/:assignmentId/images") && c.can("GET /vendor/work/:assignmentId");
  const task = useQuery({ queryKey: c.key("vendor-task", assignmentId), queryFn: ({ signal }) => c.vendor.detail(assignmentId, signal), enabled: allowed && c.ready, retry: false });
  const command = useDeliveryCommand(async () => { await Promise.all([task.refetch(), c.refresh()]); });
  useDeliveryGuard(c, Boolean(asset), command.locked || selecting);
  const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // Picker recovery must belong to this assignment, not merely another work item
  // in the same project after Android recreates the activity.
  const selectionScope = { environmentId: c.environmentId, userId: c.session.user.id, projectId: assignmentId, sessionGeneration: c.sessionGeneration };
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    void recoverPendingImageSelection(imagePolicy, selectionScope).then(result => { if (result.status === "selected") { if (current) setAsset(result.asset); else void releaseSelectedAsset(result.asset); } }).catch(() => undefined);
    return () => { current = false; };
  }, [allowed, c.scope, assignmentId]);
  useEffect(() => () => { if (asset) void releaseSelectedAsset(asset); }, [asset]);
  if (command.accessLost) return <AccessLost title="Evidence unavailable" />;
  const mismatched = task.data && (task.data.id !== assignmentId || task.data.projectId !== projectId);
  async function select(camera: boolean) {
    setSelecting(true);
    try {
      const result = camera ? await capturePhoto(imagePolicy, selectionScope) : await pickImage(imagePolicy, selectionScope);
      if (result.status === "selected") { if (active.current) setAsset(result.asset); else await releaseSelectedAsset(result.asset); }
      else if (result.status !== "cancelled") command.validation("Camera permission is unavailable. Choose a photo from your library or enable camera access in device settings.");
    } catch (cause) { command.validation(cause instanceof Error ? cause.message : "Photo selection failed."); }
    finally { if (active.current) setSelecting(false); }
  }
  function upload() {
    const current = task.data;
    if (!asset || !current || mismatched || task.isError || !allowed) return;
    const body = { expectedVersion: String(current.version), idempotencyKey: createIdempotencyKey() };
    const file = asset;
    void command.execute(async () => {
      const saved = await c.transfers.upload<VendorWorkTask>({ path: workUploadPath(assignmentId), fileUri: file.uri, fileName: file.name, mimeType: file.mimeType, fieldName: "image", parameters: body, maxBytes: imagePolicy.maxBytes, onProgress: value => setProgress(value.fraction) }).result;
      if (saved.id !== assignmentId || saved.projectId !== projectId) throw new Error("The upload response does not match this assignment.");
      return saved;
    }, () => { setAsset(null); setProgress(null); });
  }
  return <Panel title={`Current round photos (${imageIds.length})`}>
    {c.can("GET /projects/:projectId/vendor-work/:assignmentId/images/:imageId") ? <View style={p.row}>{imageIds.map((id, index) => <Button key={id} label={`View photo ${index + 1}`} variant="secondary" onPress={() => setViewing(id)} />)}</View> : null}
    {!imageIds.length ? <Text style={p.copy}>No photos supplied for this round.</Text> : null}
    {viewing && imageIds.includes(viewing) && c.can("GET /projects/:projectId/vendor-work/:assignmentId/images/:imageId") ? <PrivateWorkImage key={`${projectId}:${assignmentId}:${viewing}`} context={c} projectId={projectId} assignmentId={assignmentId} imageId={viewing} onClose={() => setViewing(null)} /> : null}
    {allowed ? <><Text style={p.copy}>JPEG, PNG or WebP, up to 12 MB. Uploading a photo does not count as a daily report.</Text><View style={p.row}><Button label="Choose work photo" variant="secondary" disabled={c.locked} onPress={() => void select(false)} /><Button label="Take work photo" variant="secondary" disabled={c.locked} onPress={() => void select(true)} /></View>{mismatched ? <ScopeMismatch /> : null}{asset ? <><Text style={p.copy}>{asset.name}</Text><Button label="Remove selected photo" variant="quiet" disabled={command.locked} onPress={() => setAsset(null)} /><Button label="Upload work photo" disabled={c.locked || task.isError || task.isPending || Boolean(mismatched)} onPress={upload} /></> : null}{task.isError ? <Button label="Reload photo upload access" variant="quiet" onPress={() => void task.refetch()} /> : null}{command.pending ? <Text style={p.copy}>{progress == null ? "Uploading photo…" : `Uploading ${Math.round(progress * 100)}%`}</Text> : null}</> : null}
    <CommandFeedback command={command} />
  </Panel>;
}

export function PrivateWorkImage({ context: c, projectId, assignmentId, imageId, onClose }: { context: DeliveryContext; projectId: string; assignmentId: string; imageId: string; onClose: () => void }) {
  const [artifact, setArtifact] = useState<DownloadedArtifact | null>(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; let downloaded: DownloadedArtifact | null = null; setArtifact(null); setError("");
    const transfer = c.transfers.download({ path: workImagePath(projectId, assignmentId, imageId), fileName: "work-evidence.jpg", mimeType: "image/jpeg", maxBytes: imagePolicy.maxBytes });
    void transfer.result.then(value => { downloaded = value; if (active) setArtifact(value); else void value.release(); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "The photo could not be loaded."); });
    return () => { active = false; transfer.cancel(); if (downloaded) void downloaded.release(); };
  }, [c.transfers, c.scope, projectId, assignmentId, imageId, retry]);
  return <View style={p.stack}><Button label="Close work photo" variant="quiet" onPress={onClose} />{error ? <><Text accessibilityRole="alert" style={p.error}>{error}</Text><Button label="Retry work photo" onPress={() => setRetry(value => value + 1)} /></> : artifact ? <Image accessibilityLabel="Private work completion evidence" source={{ uri: artifact.uri }} resizeMode="contain" style={{ width: "100%", height: 320 }} onError={() => setError("The downloaded photo could not be displayed.")} /> : <Text style={p.copy}>Loading private photo…</Text>}</View>;
}
