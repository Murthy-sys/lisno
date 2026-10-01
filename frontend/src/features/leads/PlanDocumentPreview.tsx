import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import type { PlanDocument } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { downloadPlanDocument } from "./estimateDesignApi";

export function PlanDocumentPreview({ document, published = false }: { document: PlanDocument; published?: boolean }) {
  return <PlanDocumentActions key={`${document.documentId}:${document.manifestHash}:${document.pdfUrl}`} document={document} published={published} />;
}

function PlanDocumentActions({ document, published }: { document: PlanDocument; published: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string>();
  const generation = useRef(0);
  const resource = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  function release() {
    if (resource.current) URL.revokeObjectURL(resource.current);
    resource.current = undefined;
  }
  useEffect(() => () => { generation.current += 1; release(); }, []);
  function close() { generation.current += 1; release(); setUrl(undefined); setOpen(false); setBusy(false); inFlight.current = false; }
  async function load(download: boolean) {
    if (!document.pdfUrl || inFlight.current) return;
    inFlight.current = true;
    const attempt = ++generation.current;
    setBusy(true); setError("");
    if (!download) setOpen(true);
    try {
      const file = await downloadPlanDocument(document.pdfUrl);
      if (attempt !== generation.current) return;
      if (file.blob.type !== "application/pdf") throw new Error("Invalid PDF response");
      release();
      const nextUrl = URL.createObjectURL(file.blob);
      resource.current = nextUrl;
      if (download) {
        const anchor = window.document.createElement("a");
        anchor.href = nextUrl; anchor.download = file.filename ?? document.originalFilename.replace(/\.[^.]+$/, "") + "-updated.pdf";
        window.document.body.append(anchor); anchor.click(); anchor.remove();
      } else setUrl(nextUrl);
    } catch (failure) {
      if (attempt !== generation.current) return;
      release(); setUrl(undefined);
      setError(failure instanceof ApiError ? failure.message : "The full PDF could not be opened. Refresh and try again.");
    } finally {
      if (attempt === generation.current) { setBusy(false); inFlight.current = false; }
    }
  }
  if (!document.pdfUrl || document.status !== "ready") return null;
  return <>
    <div className="plan-documents__actions">
      <Button variant="secondary" size="compact" disabled={busy} onClick={() => void load(false)}>{published ? "Preview submitted PDF" : "Preview updated PDF"}</Button>
      <Button variant="secondary" size="compact" disabled={busy} onClick={() => void load(true)}>{published ? "Download submitted PDF" : "Download updated PDF"}</Button>
    </div>
    {error && !open ? <p role="alert">{error}</p> : null}
    {open ? <ContextPanel title={document.originalFilename} eyebrow={published ? "Submitted full plan" : "Updated full plan"} width="wide" onClose={close}>
      {busy ? <p role="status">Loading full PDF…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {url ? <iframe className="file-preview__modal-document" src={url} title={`Full plan: ${document.originalFilename}`} /> : null}
      {!busy && error ? <Button variant="secondary" onClick={() => void load(false)}>Try again</Button> : null}
    </ContextPanel> : null}
  </>;
}
