import { useState, type JSX } from "react";
import { Download } from "lucide-react";

export interface DownloadButtonProps {
  label: string;
  loadingLabel: string;
  fallbackFilename: string;
  getFile: () => Promise<{ blob: Blob; filename: string | undefined }>;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
}

export function DownloadButton({
  label,
  loadingLabel,
  fallbackFilename,
  getFile,
  className,
  onBusyChange
}: DownloadButtonProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;

    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const { blob, filename } = await getFile();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? fallbackFilename;
      document.body.append(anchor);
      anchor.click();
      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 0);
    } catch {
      setError("PDF export failed. Try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className={className ?? "button button--download"}
        onClick={() => void download()}
        disabled={busy}
      >
        <Download aria-hidden="true" size={18} />
        {busy ? loadingLabel : label}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
