import { useEffect, useRef, useState } from "react";
import type { DownloadedArtifact } from "../../platform/files";
import { Button, Copy, denied, failure, useDraftGuard, type NativeContext } from "../admin/nativeWorkspace";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "../documents/useProtectedDocument";

export function ReviewArtifact({ context: c, path, name, mimeType = "application/octet-stream" }: { context: NativeContext; path: string; name: string; mimeType?: string }) {
  const [source, setSource] = useState<ProtectedDocumentSource | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useDraftGuard(false, busy, c);
  const previewMime = mimeType !== "application/octet-stream" ? mimeType : /\.pdf$/iu.test(name) ? "application/pdf" : /\.png$/iu.test(name) ? "image/png" : /\.webp$/iu.test(name) ? "image/webp" : /\.jpe?g$/iu.test(name) ? "image/jpeg" : mimeType;
  async function download() {
    if (busy) return; setBusy(true); setError(null); let file: DownloadedArtifact | null = null;
    try { file = await c.transfers.download({ path, fileName: name, mimeType, maxBytes: 50 * 1024 * 1024 }).result; if (alive.current) await file.share(); }
    catch (cause) { if (alive.current) setError(cause); }
    finally { await file?.release().catch(() => undefined); if (alive.current) setBusy(false); }
  }
  if (denied(error)) return <Copy error>This review document is no longer available for your account.</Copy>;
  return <>{previewMime === "application/pdf" || previewMime.startsWith("image/") ? <Button label={`Preview ${name}`} variant="quiet" disabled={busy} onPress={() => setSource({ path, fileName: name, mimeType: previewMime, kind: "design-file" })} /> : null}<Button label={`Download ${name}`} variant="secondary" loading={busy} onPress={() => void download()} />{error ? <Copy error>{failure(error)}</Copy> : null}<ProtectedDocumentViewer visible={source !== null} source={source} onClose={() => setSource(null)} /></>;
}
