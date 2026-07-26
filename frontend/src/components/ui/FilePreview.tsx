import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";
import type { DesignVersion } from "../../api/types";

export function FilePreview({ version }: { version: DesignVersion }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = version.mimeType.startsWith("image/") || version.mimeType === "application/pdf";

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const fetchFile = async () => apiClient.getBlob(`/design-versions/${encodeURIComponent(version.id)}/download`);
  const preview = async () => {
    setBusy("preview");
    setError(null);
    try {
      const { blob } = await fetchFile();
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
    } catch { setError("The preview could not be loaded. Please try downloading the file."); }
    finally { setBusy(null); }
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
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { setError("The download could not be prepared. Please try again."); }
    finally { setBusy(null); }
  };

  return <div className="file-preview">
    <div className="file-preview__actions">
      {supported ? <button type="button" className="button button--secondary" onClick={() => void preview()} disabled={busy !== null}>{busy === "preview" ? "Loading preview…" : `Preview ${version.originalFilename}`}</button> : null}
      <button type="button" className="button button--primary" onClick={() => void download()} disabled={busy !== null}>{busy === "download" ? "Preparing download…" : `Download ${version.originalFilename}`}</button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {previewUrl && version.mimeType.startsWith("image/") ? <img className="file-preview__image" src={previewUrl} alt={`Preview of ${version.originalFilename}`} /> : null}
    {previewUrl && version.mimeType === "application/pdf" ? <iframe className="file-preview__document" src={previewUrl} title={`Preview of ${version.originalFilename}`} /> : null}
  </div>;
}
