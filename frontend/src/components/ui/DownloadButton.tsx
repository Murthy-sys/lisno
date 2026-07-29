import { useEffect, useRef, useState, type JSX } from "react";
import { Download } from "lucide-react";

export interface DownloadButtonProps {
  label: string;
  loadingLabel: string;
  fallbackFilename: string;
  getFile: () => Promise<{ blob: Blob; filename: string | undefined }>;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
}

interface DownloadResource {
  url: string;
  anchor?: HTMLAnchorElement;
  timeout?: number;
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
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const resourceRef = useRef<DownloadResource | null>(null);

  const cleanupResource = (resource: DownloadResource | null) => {
    if (!resource) return;
    if (resource.timeout !== undefined) window.clearTimeout(resource.timeout);
    resource.anchor?.remove();
    URL.revokeObjectURL(resource.url);
    if (resourceRef.current === resource) resourceRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupResource(resourceRef.current);
    };
  }, []);

  const download = async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    let resource: DownloadResource | null = null;
    try {
      const { blob, filename } = await getFile();
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      resource = { url };
      resourceRef.current = resource;
      const anchor = document.createElement("a");
      resource.anchor = anchor;
      anchor.href = url;
      anchor.download = filename ?? fallbackFilename;
      document.body.append(anchor);
      anchor.click();
      resource.timeout = window.setTimeout(() => cleanupResource(resource), 0);
    } catch {
      cleanupResource(resource);
      if (mountedRef.current) setError("PDF export failed. Try again.");
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
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
