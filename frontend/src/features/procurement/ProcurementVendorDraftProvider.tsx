import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import type { ProcurementVendorDetail } from "../ai-estimator-knowledge/knowledgeTypes";
import type { VendorDraft } from "./vendorProfileDraft";
import type { VendorCertificateDraft } from "./useVendorMsmeCertificate";

export interface RetainedVendorDraft {
  base?: ProcurementVendorDetail;
  draft: VendorDraft;
  photo: File | null;
  removePhoto: boolean;
  confirmAddress: boolean;
  certificate: VendorCertificateDraft;
}
interface DraftContextValue {
  retained: RetainedVendorDraft | null;
  retain: (draft: RetainedVendorDraft) => void;
  clear: () => void;
}
const empty: DraftContextValue = { retained: null, retain: () => undefined, clear: () => undefined };
const DraftContext = createContext<DraftContextValue>(empty);

/** Session memory only: never serialize private vendor entries or selected files. */
export function ProcurementVendorDraftProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const read = hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read");
  const create = hasFrontendPermission(auth.authorization, "procurement.vendor_directory.create");
  const update = hasFrontendPermission(auth.authorization, "procurement.vendor_directory.update");
  const eligible = auth.user?.role === "procurement" && read && (create || update);
  const scope = eligible ? `${auth.user!.id}:${auth.reviewSession?.id ?? ""}:${create}:${update}` : "disabled";
  return <SessionDraft key={scope} enabled={eligible} canCreate={create} canUpdate={update}>{children}</SessionDraft>;
}
function SessionDraft({ children, enabled, canCreate, canUpdate }: { children: ReactNode; enabled: boolean; canCreate: boolean; canUpdate: boolean }) {
  const [retained, setRetained] = useState<RetainedVendorDraft | null>(null);
  const clear = useCallback(() => setRetained(null), []);
  const retain = useCallback((draft: RetainedVendorDraft) => {
    if (draft.base ? canUpdate : canCreate) setRetained(draft);
  }, [canCreate, canUpdate]);
  return <DraftContext.Provider value={enabled ? { retained, retain, clear } : empty}>{children}</DraftContext.Provider>;
}
export const useProcurementVendorDraft = () => useContext(DraftContext);
