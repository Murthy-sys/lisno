import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { ProcurementVendorCertificateDescriptor, ProcurementVendorCertificateUploadPolicy, ProcurementVendorCertificateUploadResult } from "../ai-estimator-knowledge/knowledgeTypes";
import { procurementRequestKey } from "./procurementPresentation";
import { getVendorCertificateUploadPolicy, stageVendorMsmeCertificate } from "./vendorProfileApi";

export function certificateFileError(file: File, policy: ProcurementVendorCertificateUploadPolicy): string | undefined {
  if (!file.size || !policy.allowedMimeTypes.some((type) => type === file.type)) return "Choose a nonempty PDF, JPEG, PNG or WebP certificate.";
  if (file.size > policy.maxUploadBytes) return `The certificate must be ${policy.maxUploadBytes.toLocaleString()} bytes or smaller.`;
}

export function useVendorMsmeCertificate(enabled: boolean) {
  const policy = useQuery({ queryKey: ["procurement-vendor-certificate-upload-policy"], queryFn: ({ signal }) => getVendorCertificateUploadPolicy(signal), enabled, retry: false });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [revision, setRevision] = useState(0);
  const command = useRef<{ file: File; key: string; target: string; result?: ProcurementVendorCertificateUploadResult } | null>(null);
  function resetStage() { command.current = null; setUploadError(""); }
  function select(next: File | null) { setFile(next); resetStage(); if (!next) setRevision((value) => value + 1); }
  function validation(existing?: ProcurementVendorCertificateDescriptor | null) {
    if (!file) return existing ? undefined : "Upload an MSME Certificate.";
    if (!policy.data || policy.isError) return "Load the certificate upload requirements before saving.";
    return certificateFileError(file, policy.data);
  }
  async function stage(existing?: { id: string; expectedVersion: number }) {
    if (!file) return undefined;
    const error = validation();
    if (error) throw new Error(error);
    const target = existing ? `${existing.id}:${existing.expectedVersion}` : "new";
    if (command.current?.file !== file || command.current.target !== target || (command.current.result && Date.parse(command.current.result.expiresAt) <= Date.now())) {
      command.current = { file, key: procurementRequestKey(), target };
    }
    const upload = command.current;
    if (upload.result) return upload.result.uploadId;
    setUploading(true); setUploadError("");
    try {
      upload.result = await stageVendorMsmeCertificate(file, upload.key, existing);
      return upload.result.uploadId;
    } catch (error) {
      setUploadError("The certificate upload was not confirmed. Your file and entries are preserved. Save again to retry.");
      throw error;
    } finally { setUploading(false); }
  }
  return { file, policy, uploading, uploadError, revision, select, resetStage, validation, stage };
}
