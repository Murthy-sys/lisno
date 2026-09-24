import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { ProcurementVendorPhotoDescriptor } from "../ai-estimator-knowledge/knowledgeTypes";

export function VendorPhotoPreview({ file, photo }: { file: File | null; photo: ProcurementVendorPhotoDescriptor | null }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl = "";
    setUrl(""); setFailed(false);
    if (!file && !photo) return;
    const load = async () => {
      try {
        const blob = file ?? (await apiClient.getBlob(photo!.url, { signal: controller.signal, showGlobalLoader: false })).blob;
        if (!active) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (active) setFailed(true); }
    };
    void load();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, photo?.id, photo?.url, attempt]);
  if (!file && !photo) return <p className="vendor-procurement__muted">No vendor picture uploaded.</p>;
  if (failed) return <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Retry picture preview</Button>}>The private picture could not be loaded.</InlineMessage>;
  return url ? <img className="vendor-profile__photo" src={url} alt={file ? "Selected vendor picture preview" : "Saved vendor picture"} onError={() => setFailed(true)} /> : <p role="status">Loading picture preview…</p>;
}
