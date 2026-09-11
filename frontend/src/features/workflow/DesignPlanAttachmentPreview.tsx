import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { downloadDesignPlanReviewAttachment } from "./projectWorkflowApi";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function DesignPlanAttachmentPreview(props: { roundId: string; attachmentIndex: number; filename: string }) {
  return <AttachmentPreview key={`${props.roundId}:${props.attachmentIndex}:${props.filename}`} {...props} />;
}

function AttachmentPreview({ roundId, attachmentIndex, filename }: { roundId: string; attachmentIndex: number; filename: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; mimeType: string }>();
  const generation = useRef(0);
  const objectUrl = useRef<string | undefined>(undefined);

  function release() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = undefined;
  }

  useEffect(() => () => { generation.current += 1; release(); }, []);

  function close() {
    generation.current += 1;
    release();
    setPreview(undefined);
    setBusy(false);
    setOpen(false);
  }

  async function load() {
    const request = ++generation.current;
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const { blob } = await downloadDesignPlanReviewAttachment(roundId, attachmentIndex);
      if (request !== generation.current) return;
      if (!imageTypes.has(blob.type) && blob.type !== "application/pdf") {
        setError("This file cannot be previewed. Use Download to open it.");
        return;
      }
      release();
      objectUrl.current = URL.createObjectURL(blob);
      setPreview({ url: objectUrl.current, mimeType: blob.type });
    } catch {
      if (request === generation.current) setError("The design attachment could not be loaded. Please try again.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }

  return <>
    <Button variant="secondary" size="compact" leadingIcon={<Eye />} aria-label={`View ${filename}`} onClick={() => void load()}>View</Button>
    {open ? <Dialog title={filename} eyebrow="Shared design" onClose={close}>
      <div className="file-preview__modal">
        {busy ? <p role="status">Loading design attachment…</p> : null}
        {error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Try again</Button></div> : null}
        {preview && imageTypes.has(preview.mimeType) ? <img className="file-preview__modal-image" src={preview.url} alt={`Designer upload: ${filename}`} /> : null}
        {preview?.mimeType === "application/pdf" ? <iframe className="file-preview__modal-document" src={preview.url} title={`Designer upload: ${filename}`} /> : null}
      </div>
    </Dialog> : null}
  </>;
}
