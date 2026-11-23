import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";

export function downloadQuotationDraftPdf(projectId: string, estimateId: string, version: number, signal: AbortSignal) {
  const query = new URLSearchParams({ estimateId, expectedVersion: String(version) });
  return apiClient.getBlob(`/projects/${encodeURIComponent(projectId)}/quotation/draft/pdf?${query}`, { signal, showGlobalLoader: false });
}

interface QuotationPdfActionProps {
  documentKey: string;
  title: string;
  note?: string;
  getFile: (signal: AbortSignal) => Promise<{ blob: Blob; filename?: string }>;
}

export function QuotationPdfAction(props: QuotationPdfActionProps) {
  return <QuotationPdfButton key={props.documentKey} {...props} />;
}

function QuotationPdfButton({ title, note, getFile }: QuotationPdfActionProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <Button ref={trigger} variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>View quotation PDF</Button>
    {open && <ContextPanel title={title} eyebrow="Quotation PDF" description={note} width="wide" returnFocusRef={trigger} onClose={() => setOpen(false)}>
      <QuotationPdfContent title={title} getFile={getFile} />
    </ContextPanel>}
  </>;
}

function QuotationPdfContent({ title, getFile }: Pick<QuotationPdfActionProps, "title" | "getFile">) {
  const [attempt, setAttempt] = useState(0);
  const [file, setFile] = useState<{ url: string; filename: string }>();
  const [error, setError] = useState("");
  // A caller may re-render while editing. The enclosing key identifies the document to fetch.
  const loader = useRef(getFile);
  useEffect(() => { loader.current = getFile; }, [getFile]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const { blob, filename } = await loader.current(controller.signal);
        if (controller.signal.aborted) return;
        if (blob.type !== "application/pdf" || !blob.size) throw new Error("Invalid PDF");
        objectUrl = URL.createObjectURL(blob);
        setFile({ url: objectUrl, filename: filename?.replace(/[/\\]/g, "-") || "quotation.pdf" });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof ApiError ? failure.message : "The quotation PDF could not be opened. Please try again.");
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt]);
  if (error) return <><p role="alert">{error}</p><Button variant="secondary" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</Button></>;
  if (!file) return <p role="status">Preparing quotation PDF…</p>;
  return <>
    <p><a className="button button--secondary" href={file.url} download={file.filename}>Download PDF</a></p>
    <iframe className="file-preview__modal-document" style={{ height: "65dvh", maxHeight: "none" }} src={file.url} title={title} />
  </>;
}
