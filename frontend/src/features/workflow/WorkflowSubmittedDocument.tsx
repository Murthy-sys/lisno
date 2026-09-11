import { useEffect, useId, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { downloadWorkflowActionProof, type DesignStageOperational } from "./projectWorkflowApi";

type SubmittedDocument = NonNullable<DesignStageOperational["submittedDocument"]>;
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function WorkflowSubmittedDocument(props: {
  projectId: string;
  document: SubmittedDocument;
  onReady: (eventId: string, ready: boolean) => void;
}) {
  return <SubmittedDocumentPreview key={`${props.projectId}:${props.document.eventId}`} {...props} />;
}

function SubmittedDocumentPreview({ projectId, document, onReady }: {
  projectId: string;
  document: SubmittedDocument;
  onReady: (eventId: string, ready: boolean) => void;
}) {
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mimeType: string }>();
  const notify = useRef(onReady);
  const mounted = useRef(true);
  notify.current = onReady;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setBusy(true);
    setError("");
    setPreview(undefined);
    notify.current(document.eventId, false);
    void downloadWorkflowActionProof(projectId, document.eventId).then(({ blob }) => {
      if (!active) return;
      if (!imageTypes.has(blob.type) && blob.type !== "application/pdf") {
        setError("This document cannot be previewed. Download it to review the submitted file.");
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, mimeType: blob.type });
      notify.current(document.eventId, true);
    }).catch(() => {
      if (active) setError("The Designer’s document could not be loaded. Please try again.");
    }).finally(() => { if (active) setBusy(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, document.eventId, attempt]);

  const documentContent = () => preview?.mimeType === "application/pdf"
    ? <iframe className="workflow-submitted-document__expanded" src={preview.url} title={`Designer’s Internal Kick off document: ${document.filename}`} />
    : preview ? <img className="workflow-submitted-document__expanded" src={preview.url} alt={`Designer’s Internal Kick off document: ${document.filename}`} onError={() => {
      setError("The document preview could not be displayed. Retry or download the submitted file.");
      setPreview(undefined);
      setOpen(false);
      notify.current(document.eventId, false);
    }} /> : null;

  return <section className="workflow-submitted-document" aria-labelledby={`${id}-title`}>
    <div className="workflow-submitted-document__heading">
      <div><h5 id={`${id}-title`}>Designer’s Internal Kick off document</h5><p>{document.filename}</p></div>
      <div className="workflow-submitted-document__buttons">
        <Button variant="secondary" size="compact" disabled={!preview} aria-label={`View ${document.filename}`} onClick={() => setOpen(true)}>View document</Button>
        <DownloadButton label="Download" loadingLabel="Downloading…" errorMessage="The submitted document could not be downloaded. Please try again."
          fallbackFilename={document.filename} className="ui-button ui-button--secondary ui-button--compact" getFile={async () => {
            const result = await downloadWorkflowActionProof(projectId, document.eventId);
            if (mounted.current) notify.current(document.eventId, true);
            return result;
          }} />
      </div>
    </div>
    {busy ? <p role="status">Loading the Designer’s document…</p> : null}
    {error ? <div className="workflow-submitted-document__error"><p role="alert">{error}</p><Button variant="secondary" size="compact" onClick={() => setAttempt((value) => value + 1)}>Retry document</Button></div> : null}
    {open && preview ? <Dialog title={document.filename} eyebrow="Internal Kick off document" onClose={() => setOpen(false)}>{documentContent()}</Dialog> : null}
  </section>;
}
