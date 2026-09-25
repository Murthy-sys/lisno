import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Field, FileInput } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { ProcurementVendorCertificateDescriptor } from "../ai-estimator-knowledge/knowledgeTypes";
import { downloadVendorMsmeCertificate } from "./vendorProfileApi";
import type { useVendorMsmeCertificate } from "./useVendorMsmeCertificate";

export function VendorMsmeCertificateField({ certificate, upload, error, readOnly, onSelect }: {
  certificate?: ProcurementVendorCertificateDescriptor | null;
  upload: ReturnType<typeof useVendorMsmeCertificate>;
  error?: string;
  readOnly: boolean;
  onSelect: (file: File | null) => void;
}) {
  const id = useId();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function download() {
    if (!certificate) return;
    const request = new AbortController(); controller.current = request;
    setDownloading(true); setDownloadError("");
    try {
      const { blob } = await downloadVendorMsmeCertificate(certificate, request.signal);
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = certificate.originalFilename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { if (!request.signal.aborted) setDownloadError("The certificate could not be downloaded. Try again."); }
    finally { if (!request.signal.aborted) setDownloading(false); }
  }
  return <div className="vendor-profile__certificate">
    {certificate ? <><p>Saved certificate: {certificate.originalFilename}</p><Button variant="secondary" busy={downloading} onClick={() => void download()}>Download MSME certificate</Button></> : readOnly ? <p>MSME Certificate is missing. An upload is required when this profile is next saved.</p> : null}
    {downloadError ? <InlineMessage tone="error" role="alert">{downloadError}</InlineMessage> : null}
    {!readOnly ? <>
      <Field id={`${id}-certificate`} label="MSME Certificate" required={!certificate} error={error} hint={upload.policy.data ? `PDF, JPEG, PNG or WebP. Maximum ${(upload.policy.data.maxUploadBytes / (1024 * 1024)).toLocaleString()} MB. ${certificate ? "Choose a file to replace the saved certificate when you save." : "Required when MSME Registered is Yes."}` : "PDF, JPEG, PNG or WebP. Loading the server upload limit."}>
        {(props) => <FileInput {...props} key={upload.revision} accept={upload.policy.data?.allowedMimeTypes.join(",") ?? "application/pdf,image/jpeg,image/png,image/webp"} onChange={(event) => onSelect(event.target.files?.[0] ?? null)} />}
      </Field>
      {upload.policy.isFetching ? <p role="status">Loading certificate upload requirements…</p> : null}
      {upload.policy.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void upload.policy.refetch()}>Retry certificate requirements</Button>}>Certificate upload requirements could not be loaded.</InlineMessage> : null}
      {upload.file ? <><p role="status">{upload.uploading ? "Uploading" : "Selected"}: {upload.file.name}</p><Button variant="secondary" onClick={() => onSelect(null)}>Clear selected certificate</Button></> : null}
      {upload.uploadError ? <InlineMessage tone="error" role="alert">{upload.uploadError}</InlineMessage> : null}
    </> : null}
  </div>;
}
