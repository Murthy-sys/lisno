import { useEffect, useState } from "react";
import { Download, Eye, X } from "lucide-react";

import { apiClient } from "../../api/client";
import type { ClientDesignVersion } from "../../api/types";
import { Dialog } from "./Dialog";

export function FilePreview({ version }: { version: ClientDesignVersion }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isImage = version.mimeType.startsWith("image/");
  const isPdf = version.mimeType === "application/pdf";

  const fetchFile = async () =>
    apiClient.getBlob(
      `/design-versions/${encodeURIComponent(version.id)}/download`
    );

  useEffect(() => {
    if (!isImage) return;
    let active = true;
    void fetchFile()
      .then(({ blob }) => {
        if (!active) return;
        setPreviewUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (active) setError("The image thumbnail could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [isImage, version.id]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const preview = async () => {
    if (isImage && previewUrl) {
      setPreviewOpen(true);
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      const { blob } = await fetchFile();
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
      setPreviewOpen(true);
    } catch {
      setError("The preview could not be loaded. Please try downloading the file.");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    setError(null);
    try {
      const { blob, filename } = await fetchFile();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? version.originalFilename;
      document.body.append(anchor);
      anchor.click();
      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 0);
    } catch {
      setError("The download could not be prepared. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="file-preview">
      <div className="file-preview__actions">
        {isImage && previewUrl ? (
          <button
            type="button"
            className="file-preview__thumbnail"
            aria-label={`Preview ${version.originalFilename}`}
            onClick={() => void preview()}
          >
            <img
              className="file-preview__thumbnail-image"
              src={previewUrl}
              alt={`Thumbnail of ${version.originalFilename}`}
            />
          </button>
        ) : null}
        {isPdf ? (
          <button
            type="button"
            className="button button--preview"
            onClick={() => void preview()}
            disabled={busy !== null}
          >
            <Eye aria-hidden="true" size={18} />
            {busy === "preview"
              ? "Loading preview…"
              : `Preview ${version.originalFilename}`}
          </button>
        ) : null}
        <button
          type="button"
          className="button button--download"
          onClick={() => void download()}
          disabled={busy !== null}
        >
          <Download aria-hidden="true" size={18} />
          {busy === "download"
            ? "Preparing download…"
            : `Download ${version.originalFilename}`}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {previewOpen && previewUrl ? (
        <Dialog
          title={version.originalFilename}
          eyebrow="File preview"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="file-preview__modal">
            {isImage ? (
              <img
                className="file-preview__modal-image"
                src={previewUrl}
                alt={`Preview of ${version.originalFilename}`}
              />
            ) : null}
            {isPdf ? (
              <iframe
                className="file-preview__modal-document"
                src={previewUrl}
                title={`Preview of ${version.originalFilename}`}
              />
            ) : null}
            <footer className="file-preview__modal-actions">
              <button
                type="button"
                className="button button--close"
                onClick={() => setPreviewOpen(false)}
              >
                <X aria-hidden="true" size={18} />
                Close preview
              </button>
            </footer>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
