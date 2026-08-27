import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";

import type { SupportingDocumentSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { DownloadButton } from "../../components/ui/DownloadButton";

interface SupportingDocumentActionsProps {
  supportingDocument: SupportingDocumentSummary | null;
  getFile: () => Promise<{ blob: Blob; filename: string | undefined }>;
}

interface ImagePreview {
  url: string;
  filename: string;
}

export function SupportingDocumentActions({
  supportingDocument,
  getFile
}: SupportingDocumentActionsProps) {
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequest = useRef(0);
  const previewUrl = useRef<string | null>(null);

  const revokePreviewUrl = () => {
    if (!previewUrl.current) return;
    URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  };

  useEffect(() => {
    setPreview(null);
    setPreviewBusy(false);
    setPreviewError("");
    return () => {
      previewRequest.current += 1;
      revokePreviewUrl();
    };
  }, [supportingDocument?.id]);

  if (!supportingDocument) {
    return <span className="supporting-document supporting-document--missing">No supporting document</span>;
  }

  const image = supportingDocument.mimeType.startsWith("image/");
  const previewImage = async () => {
    if (previewBusy) return;
    const request = ++previewRequest.current;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const file = await getFile();
      if (previewRequest.current !== request) return;
      revokePreviewUrl();
      const url = URL.createObjectURL(file.blob);
      previewUrl.current = url;
      setPreview({
        url,
        filename: file.filename ?? supportingDocument.originalFilename
      });
    } catch {
      if (previewRequest.current !== request) return;
      setPreviewError("The supporting document could not be loaded.");
    } finally {
      if (previewRequest.current === request) setPreviewBusy(false);
    }
  };

  const closePreview = () => {
    previewRequest.current += 1;
    revokePreviewUrl();
    setPreview(null);
  };

  return (
    <div className="supporting-document">
      <span className="supporting-document__metadata">
        <strong>{supportingDocument.originalFilename}</strong>
        <small>{formatBytes(supportingDocument.sizeBytes)}</small>
      </span>
      <div className="supporting-document__actions">
        {image ? (
          <Button
            variant="secondary"
            size="compact"
            leadingIcon={<Eye />}
            busy={previewBusy}
            busyLabel="Loading receipt…"
            onClick={() => void previewImage()}
            aria-label={`Preview receipt ${supportingDocument.originalFilename}`}
          >
            Preview receipt
          </Button>
        ) : null}
        <DownloadButton
          label={`Download ${supportingDocument.originalFilename}`}
          loadingLabel="Preparing download…"
          errorMessage="The supporting document could not be downloaded."
          fallbackFilename={supportingDocument.originalFilename}
          getFile={getFile}
          className="button button--secondary supporting-document__download"
        />
      </div>
      {previewError ? <p role="alert">{previewError}</p> : null}
      {preview ? (
        <Dialog
          title={`Receipt: ${preview.filename}`}
          eyebrow="Supporting document"
          description="Authenticated image preview for this recorded purchase."
          onClose={closePreview}
        >
          <div className="supporting-document-preview">
            <img src={preview.url} alt={`Receipt ${preview.filename}`} />
            <DownloadButton
              label="Download receipt"
              loadingLabel="Preparing download…"
              errorMessage="The supporting document could not be downloaded."
              fallbackFilename={supportingDocument.originalFilename}
              getFile={getFile}
              className="button button--secondary"
            />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
