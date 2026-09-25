import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { KnowledgeMaster, ProcurementVendorCertificateUploadPolicy, ProcurementVendorCertificateUploadResult, ProcurementVendorDetail, ProcurementVendorPhotoMutationResult, ProcurementVendorProfileInput } from "../../../../shared/knowledge/knowledgeTypes";
import { profileFromDraft, validateVendorDraft, vendorDraft, VENDOR_BANK_FIELDS, VENDOR_ORGANIZATION_OPTIONS, VENDOR_TEXT_FIELDS, type VendorDraft } from "../../../../shared/knowledge/vendorProfileDraft";
import { ApiError } from "../../core/http/apiClient";
import { pickDocument, releaseSelectedAsset, TransferHttpError, type SelectedAsset } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { KnowledgeBasketEditor } from "./KnowledgeCatalogManagement";
import { KnowledgeVendorBaseline } from "./KnowledgeVendorBaseline";
import { allKnowledgePages, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";

const VENDORS = "/admin/ai-estimator-knowledge/vendors";
const vendorPath = (id: string) => `${VENDORS}/${encodeURIComponent(id)}`;
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const uncertain = (error: unknown) => !(error instanceof ApiError || error instanceof TransferHttpError) || error.status >= 500 || error.status < 400 || error.status === 408;
interface VendorCommand { name: string; procurementProfile: ProcurementVendorProfileInput; status?: "active" | "inactive"; idempotencyKey: string; msmeCertificateUploadId?: string; confirmPhysicalAddressVerification: boolean }

export function KnowledgeVendorEditor({ context, existing, onClose, onSaved }: { readonly context: KnowledgeMobileContext; readonly existing?: KnowledgeMaster; readonly onClose: () => void; readonly onSaved: (value: KnowledgeMaster) => void }) {
  const runtime = useConfiguredRuntime();
  const query = useQuery({ queryKey: context.key("vendor-detail", existing?.id ?? "new"), queryFn: async ({ signal }) => {
    const result = await runtime.runtime.api.authenticated.get<ProcurementVendorDetail>(vendorPath(existing!.id), { signal });
    if (result.id !== existing!.id || result.masterType !== "vendors") throw new Error("Vendor identity changed. Refresh the directory.");
    return result;
  }, enabled: Boolean(existing) && context.ready && context.canRead, gcTime: 0, refetchOnWindowFocus: false });
  if (!context.canRead) return <KnowledgeModal title="Vendor details" onClose={onClose}><StateView title="Vendor access required" message="Your current access does not allow you to read vendor details." tone="denied" /></KnowledgeModal>;
  if (!context.ready) return <KnowledgeModal title="Vendor details" onClose={onClose}><KnowledgeText>Preparing configuration…</KnowledgeText></KnowledgeModal>;
  if (existing && !query.data) return <KnowledgeModal title="Vendor details" onClose={onClose}>{query.isError ? <StateView title="Vendor unavailable" message={catalogError(query.error)} actionLabel="Retry vendor details" onAction={() => void query.refetch()} /> : <KnowledgeText>Loading vendor details…</KnowledgeText>}</KnowledgeModal>;
  return <VendorForm key={`${context.scopeKey}:${existing?.id ?? "new"}`} context={context} {...(query.data ? { initial: query.data } : {})} accessError={query.isError} onClose={onClose} onSaved={onSaved} />;
}

function VendorForm({ context, initial, accessError, onClose, onSaved }: { readonly context: KnowledgeMobileContext; readonly initial?: ProcurementVendorDetail; readonly accessError: boolean; readonly onClose: () => void; readonly onSaved: (value: KnowledgeMaster) => void }) {
  const runtime = useConfiguredRuntime();
  const api = runtime.runtime.api.authenticated;
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => vendorDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [certificate, setCertificate] = useState<SelectedAsset | null>(null);
  const [photo, setPhoto] = useState<SelectedAsset | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [partial, setPartial] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [basketEditor, setBasketEditor] = useState<"main" | "sub" | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const mounted = useRef(true);
  const controller = useRef(new AbortController());
  const selectedAssets = useRef(new Set<SelectedAsset>());
  const submission = useRef(false);
  const fileOperation = useRef(false);
  const transfers = useRef(new Set<Promise<unknown>>());
  function track<T>(promise: Promise<T>): Promise<T> { transfers.current.add(promise); void promise.finally(() => transfers.current.delete(promise)).catch(() => undefined); return promise; }
  const certificateCommand = useRef<{ asset: SelectedAsset; key: string; target: string; result?: ProcurementVendorCertificateUploadResult } | null>(null);
  const command = useRef<{ id?: string; expectedVersion?: number; input: VendorCommand } | null>(null);
  const savedId = useRef<string | null>(null);
  const photoCommand = useRef<{ id: string; version: number; key: string; asset: SelectedAsset | null; remove: boolean } | null>(null);
  useEffect(() => {
    mounted.current = true;
    if (controller.current.signal.aborted) controller.current = new AbortController();
    return () => {
      mounted.current = false; controller.current.abort();
      const assets = [...selectedAssets.current];
      void Promise.allSettled([...transfers.current]).then(() => Promise.all(assets.map(asset => releaseSelectedAsset(asset))));
    };
  }, []);
  const readOnly = Boolean(base ? !context.canUpdate || base.status === "archived" : !context.canCreate);
  const policy = useQuery({ queryKey: context.key("vendor-certificate-policy"), queryFn: ({ signal }) => api.get<ProcurementVendorCertificateUploadPolicy>(`${VENDORS}/msme-certificate-upload-policy`, { signal }), enabled: context.ready && context.canRead && !readOnly, retry: false });
  const baskets = useQuery({ queryKey: context.key("baskets", "vendor"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets(page)), enabled: context.ready && context.canRead });
  const subBaskets = useQuery({ queryKey: context.key("sub-baskets", draft.mainBasketId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(draft.mainBasketId, page)), enabled: context.ready && context.canRead && Boolean(draft.mainBasketId) });
  const currentBasket = baskets.data?.find(value => value.id === draft.mainBasketId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(vendorDraft(base)) || Boolean(certificate || photo || removePhoto);

  async function loadDetail(id: string) {
    const detail = await api.get<ProcurementVendorDetail>(vendorPath(id), { signal: controller.current.signal });
    if (detail.id !== id || detail.masterType !== "vendors") throw new Error("Vendor identity changed. Refresh the directory.");
    return detail;
  }
  async function stageCertificate(): Promise<string | undefined> {
    if (!certificate || draft.msmeRegistered !== "yes") return undefined;
    if (!policy.data || policy.isError) throw new Error("Load the certificate upload requirements before saving.");
    const target = base ? `${base.id}:${base.version}` : "new";
    if (certificateCommand.current?.asset !== certificate || certificateCommand.current.target !== target || (certificateCommand.current.result && Date.parse(certificateCommand.current.result.expiresAt) <= Date.now())) certificateCommand.current = { asset: certificate, key: createIdempotencyKey(), target };
    const staged = certificateCommand.current;
    if (staged.result) return staged.result.uploadId;
    staged.result = await track(runtime.runtime.transfers.upload<ProcurementVendorCertificateUploadResult>({ path: base ? `${vendorPath(base.id)}/msme-certificate-uploads` : `${VENDORS}/msme-certificate-uploads`, fileUri: staged.asset.uri, fileName: staged.asset.name, mimeType: staged.asset.mimeType, fieldName: "certificate", maxBytes: policy.data.maxUploadBytes, parameters: { idempotencyKey: staged.key, ...(base ? { expectedVersion: String(base.version) } : {}) }, signal: controller.current.signal, onProgress: value => { if (mounted.current) setProgress(value.fraction); } }).result);
    return staged.result.uploadId;
  }
  async function saveVendor() {
    if (!mounted.current) return;
    let detail: ProcurementVendorDetail;
    if (savedId.current) detail = await loadDetail(savedId.current);
    else {
      if (!command.current) {
        const uploadId = await stageCertificate();
        if (!mounted.current) return;
        command.current = { ...(base ? { id: base.id, expectedVersion: base.version } : {}), input: { name: draft.name.trim(), procurementProfile: profileFromDraft(draft), idempotencyKey: createIdempotencyKey(), confirmPhysicalAddressVerification: confirmAddress, ...(base ? { status: draft.status } : {}), ...(uploadId ? { msmeCertificateUploadId: uploadId } : {}) } };
      }
      const current = command.current;
      let summary: KnowledgeMaster;
      try {
        summary = current.id ? await api.patch<KnowledgeMaster>(vendorPath(current.id), { ...current.input, expectedVersion: current.expectedVersion }, { signal: controller.current.signal }) : await api.post<KnowledgeMaster>(VENDORS, current.input, { signal: controller.current.signal });
      } catch (error) {
        if (mounted.current) setRecovery(uncertain(error));
        if (!uncertain(error)) command.current = null;
        throw error;
      }
      if (current.id && summary.id !== current.id) throw new Error("The saved vendor identity could not be confirmed.");
      savedId.current = summary.id;
      if (mounted.current) { setPartial(true); setRecovery(false); }
      detail = await loadDetail(summary.id);
    }
    if (!mounted.current) return;
    setBase(detail); setDraft(vendorDraft(detail)); setConfirmAddress(false);
    if (photo || removePhoto || photoCommand.current) {
      photoCommand.current ??= { id: detail.id, version: detail.version, key: createIdempotencyKey(), asset: photo, remove: removePhoto };
      const current = photoCommand.current;
      if (!(current.remove && !detail.geoTaggedPicture)) {
        const result = current.asset ? await track(runtime.runtime.transfers.upload<ProcurementVendorPhotoMutationResult>({ path: `${vendorPath(current.id)}/photo`, method: "PUT", fieldName: "photo", fileUri: current.asset.uri, fileName: current.asset.name, mimeType: current.asset.mimeType, maxBytes: policy.data?.maxUploadBytes ?? 25 * 1024 * 1024, parameters: { expectedVersion: String(current.version), idempotencyKey: current.key }, signal: controller.current.signal, onProgress: value => { if (mounted.current) setProgress(value.fraction); } }).result) : await api.delete<ProcurementVendorPhotoMutationResult>(`${vendorPath(current.id)}/photo`, { expectedVersion: current.version }, { signal: controller.current.signal });
        if (result.vendorId !== detail.id) throw new Error("The picture response belongs to another vendor.");
        detail = { ...detail, version: result.version, geoTaggedPicture: result.geoTaggedPicture };
      }
    }
    if (!mounted.current) return;
    await context.refresh();
    if (mounted.current) { onSaved(detail); onClose(); }
  }
  const save = useMutation({ mutationFn: saveVendor, retry: false, onError: error => {
    if (!mounted.current) return;
    if ((error instanceof ApiError || error instanceof TransferHttpError) && error.code === "VERSION_CONFLICT") setConflict(true);
    if (error instanceof ApiError && error.fields) setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, value]) => [key.replace(/^procurementProfile\./, "").replace(/^msmeCertificateUploadId$/, "msmeCertificate"), value])));
  }, onSettled: () => { submission.current = false; if (mounted.current) setProgress(null); } });
  const reload = useMutation({ mutationFn: () => loadDetail(base!.id), onSuccess: detail => { setBase(detail); setDraft(vendorDraft(detail)); command.current = null; savedId.current = null; photoCommand.current = null; certificateCommand.current = null; setConfirmAddress(false); setConflict(false); setRecovery(false); setPartial(false); setErrors({}); save.reset(); } });
  const busy = save.isPending || reload.isPending || fileBusy;
  const blocked = busy || readOnly || accessError || recovery || partial || conflict;
  function change<K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) {
    setDraft(current => ({ ...current, [key]: value, ...(key === "vendorType" ? { executionType: [] } : {}), ...(key === "currentAddress" ? { currentAddressVerifiedPhysically: "" } : {}) }));
    if (key === "currentAddress") setConfirmAddress(false);
    if (key === "currentAddressVerifiedPhysically") setConfirmAddress(value === "yes");
    setErrors({}); command.current = null; save.reset();
  }
  async function chooseFile(kind: "certificate" | "photo") {
    if (blocked || !policy.data || fileOperation.current) return;
    fileOperation.current = true;
    setFileBusy(true); setFileError("");
    try {
      const result = await pickDocument({ acceptedMimeTypes: kind === "certificate" ? policy.data.allowedMimeTypes : ["image/jpeg", "image/png", "image/webp"], maxBytes: policy.data.maxUploadBytes });
      if (result.status !== "selected") return;
      if (!mounted.current) { await releaseSelectedAsset(result.asset); return; }
      const previous = kind === "certificate" ? certificate : photo;
      if (previous) { selectedAssets.current.delete(previous); void releaseSelectedAsset(previous); }
      selectedAssets.current.add(result.asset);
      if (kind === "certificate") { setCertificate(result.asset); certificateCommand.current = null; }
      else { setPhoto(result.asset); setRemovePhoto(false); photoCommand.current = null; }
      command.current = null; save.reset();
    } catch (error) { if (mounted.current) setFileError(catalogError(error)); }
    finally { fileOperation.current = false; if (mounted.current) setFileBusy(false); }
  }
  async function viewFile(descriptor: { url: string; mimeType: string; byteSize: number }, name: string) {
    if (fileOperation.current) return;
    fileOperation.current = true;
    setFileBusy(true); setFileError("");
    try { const artifact = await track(runtime.runtime.transfers.download({ path: descriptor.url, fileName: name, mimeType: descriptor.mimeType, maxBytes: descriptor.byteSize, signal: controller.current.signal }).result); if (mounted.current) await artifact.share({ cleanupAfterShare: true }); else await artifact.release(); }
    catch (error) { if (mounted.current) setFileError(catalogError(error)); }
    finally { fileOperation.current = false; if (mounted.current) setFileBusy(false); }
  }
  function submit() {
    if (blocked || submission.current) return;
    const next = validateVendorDraft(draft, { requireOrganizationType: !base });
    if (draft.msmeRegistered === "yes" && !certificate && !base?.msmeCertificate) next.msmeCertificate = "Upload an MSME Certificate.";
    if (certificate && (!policy.data || policy.isError)) next.msmeCertificate = "Load the certificate upload requirements before saving.";
    if (!baskets.isSuccess || !subBaskets.isSuccess) next.mainBasketId = "Load the complete procurement classification before saving.";
    setErrors(next);
    if (Object.keys(next).length) return;
    submission.current = true; save.mutate();
  }
  const field = (key: keyof VendorDraft, label: string, keyboardType?: "email-address" | "phone-pad" | "decimal-pad" | "number-pad") => <Field key={key} label={label} value={String(draft[key])} onChangeText={value => change(key, value as never)} error={errors[key] ?? errors[`bankAccount.${key}`]} editable={!blocked} maxLength={key === "accountNumber" ? 34 : key === "gstNumber" ? 15 : 4000} {...(keyboardType ? { keyboardType } : {})} />;
  return <KnowledgeModal title={base ? "Vendor details" : "Add vendor"} busy={busy} onClose={() => closeCatalogDraft(dirty || recovery || partial, onClose)}>
    {readOnly ? <KnowledgeText>This vendor is read-only.</KnowledgeText> : null}
    {accessError ? <KnowledgeText error>Vendor details could not be refreshed. Close and reopen this vendor before saving.</KnowledgeText> : null}
    {Object.keys(errors).length ? <KnowledgeText error>Review the required fields before saving.</KnowledgeText> : null}
    {save.isError ? <KnowledgeText error>{partial ? "Vendor saved; remaining details or picture could not be confirmed. " : ""}{catalogError(save.error)}</KnowledgeText> : null}
    {recovery || partial ? <><KnowledgeText>The result is not fully confirmed. Retry the same operation before changing these entries.</KnowledgeText><Button label="Retry same vendor save" disabled={busy || conflict} onPress={() => { if (submission.current) return; submission.current = true; save.mutate(); }} /></> : null}
    {conflict && base ? <Button label="Reload latest and replace entries" disabled={busy} onPress={() => closeCatalogDraft(true, () => reload.mutate())} /> : null}
    {reload.isError ? <KnowledgeText error>{catalogError(reload.error)}</KnowledgeText> : null}
    <KnowledgeCard title="Vendor information">
      {field("name", "Entity Name")}
      <KnowledgeSelect label="Vendor Organization Type" value={draft.organizationType} placeholder="Select organization type" options={VENDOR_ORGANIZATION_OPTIONS.map(([value, label]) => ({ value, label }))} disabled={blocked} onChange={value => change("organizationType", value as VendorDraft["organizationType"])} />
      {errors.organizationType ? <KnowledgeText error>{errors.organizationType}</KnowledgeText> : null}
      <KnowledgeSelect label="Vendor Type" value={draft.vendorType} placeholder="Select vendor type" disabled={blocked} options={[{ value: "execution", label: "Execution" }, { value: "supplier", label: "Supplier" }]} onChange={value => change("vendorType", value as VendorDraft["vendorType"])} />
      {draft.vendorType === "execution" ? <View style={s.row}>{(["labor", "material_labour"] as const).map(value => <KnowledgeChoice key={value} label={value === "labor" ? "Labor" : "Material + Labour"} multiple selected={draft.executionType.includes(value)} disabled={blocked} onPress={() => change("executionType", draft.executionType.includes(value) ? draft.executionType.filter(item => item !== value) : [...draft.executionType, value])} />)}</View> : null}
      {errors.vendorType || errors.executionType ? <KnowledgeText error>{errors.vendorType ?? errors.executionType}</KnowledgeText> : null}
      {Object.entries(VENDOR_TEXT_FIELDS).filter(([key]) => !["address", "aadhar", "pan", "currentAddress"].includes(key)).map(([key, label]) => field(key as keyof VendorDraft, label, key === "email" ? "email-address" : key === "phoneNumber" ? "phone-pad" : undefined))}
      <KnowledgeSelect label="GST Registered" value={draft.gstRegistered} placeholder="Select Yes or No" disabled={blocked} options={YES_NO} onChange={value => change("gstRegistered", value as VendorDraft["gstRegistered"])} />
      {draft.gstRegistered === "yes" ? field("gstNumber", "GST Number") : null}
      <KnowledgeSelect label="MSME Registered" value={draft.msmeRegistered} placeholder="Select Yes or No" disabled={blocked} options={YES_NO} onChange={value => change("msmeRegistered", value as VendorDraft["msmeRegistered"])} />
      {draft.msmeRegistered === "yes" ? <View style={s.stack}>{certificate ? <KnowledgeText>Selected: {certificate.name}</KnowledgeText> : base?.msmeCertificate ? <Button label={`Open MSME certificate: ${base.msmeCertificate.originalFilename}`} variant="secondary" disabled={busy} onPress={() => void viewFile(base.msmeCertificate!, base.msmeCertificate!.originalFilename)} /> : <KnowledgeText>No MSME certificate uploaded.</KnowledgeText>}{!readOnly ? <Button label={certificate || base?.msmeCertificate ? "Replace MSME certificate" : "Upload MSME certificate"} variant="secondary" disabled={blocked || !policy.isSuccess} onPress={() => void chooseFile("certificate")} /> : null}{errors.msmeCertificate ? <KnowledgeText error>{errors.msmeCertificate}</KnowledgeText> : null}</View> : null}
      {errors.gstRegistered || errors.msmeRegistered ? <KnowledgeText error>{errors.gstRegistered ?? errors.msmeRegistered}</KnowledgeText> : null}
      {field("turnoverSelfDeclared", "Turnover (Self Declared) (INR)", "decimal-pad")}
      {field("turnoverVerified", "Turnover (Verified) (INR, optional)", "decimal-pad")}
      {errors.turnoverSelfDeclaredPaise || errors.turnoverVerifiedPaise ? <KnowledgeText error>{errors.turnoverSelfDeclaredPaise ?? errors.turnoverVerifiedPaise}</KnowledgeText> : null}
      {base?.status === "archived" ? <KnowledgeText>Status: archived</KnowledgeText> : base ? <KnowledgeSelect label="Status" value={draft.status} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} allowEmpty={false} disabled={blocked} onChange={value => change("status", value as VendorDraft["status"])} /> : null}
    </KnowledgeCard>
    <KnowledgeCard title="Bank account details"><KnowledgeText>Optional. If entered, provide the account holder, bank, account number and IFSC.</KnowledgeText>{Object.entries(VENDOR_BANK_FIELDS).map(([key, label]) => field(key as keyof VendorDraft, label, key === "accountNumber" ? "number-pad" : undefined))}</KnowledgeCard>
    <KnowledgeCard title="Address and verification">{field("address", "Address")}{field("aadhar", "AADHAR", "number-pad")}{field("pan", "PAN")}{field("currentAddress", "Current Address")}
      <KnowledgeSelect label="Current Address Verified Physically" value={draft.currentAddressVerifiedPhysically} disabled={blocked} options={YES_NO} placeholder="Select Yes or No" onChange={value => change("currentAddressVerifiedPhysically", value as VendorDraft["currentAddressVerifiedPhysically"])} />
      {errors.currentAddressVerifiedPhysically ? <KnowledgeText error>{errors.currentAddressVerifiedPhysically}</KnowledgeText> : null}
    </KnowledgeCard>
    <KnowledgeCard title="Procurement classification">
      <KnowledgeSelect label="Main Basket" value={draft.mainBasketId} disabled={blocked || !baskets.isSuccess} placeholder="Select main basket" options={(baskets.data ?? []).map(value => ({ value: value.id, label: value.name, disabled: value.status !== "active" && value.id !== base?.procurementProfile?.mainBasketId }))} onChange={value => { change("mainBasketId", value); change("subBasketId", ""); }} />
      <KnowledgeSelect label="Sub Basket" value={draft.subBasketId} disabled={blocked || !subBaskets.isSuccess} placeholder="Select sub basket" options={(subBaskets.data ?? []).map(value => ({ value: value.id, label: value.name }))} onChange={value => change("subBasketId", value)} />
      {errors.mainBasketId || errors.subBasketId ? <KnowledgeText error>{errors.mainBasketId ?? errors.subBasketId}</KnowledgeText> : null}
      {(baskets.isError || subBaskets.isError) ? <Button label="Retry classification" onPress={() => { void baskets.refetch(); void subBaskets.refetch(); }} /> : null}
      {context.canCreate && !readOnly ? <View style={s.row}><Button label="Add main basket" variant="secondary" disabled={blocked} onPress={() => setBasketEditor("main")} /><Button label="Add sub-basket" variant="secondary" disabled={blocked || currentBasket?.status !== "active"} onPress={() => setBasketEditor("sub")} /></View> : null}
    </KnowledgeCard>
    <KnowledgeCard title="Vendor documentation">
      <KnowledgeText>Optional geo-tagged JPEG, PNG or WebP. Original metadata is preserved; a picture does not verify the address.</KnowledgeText>
      {photo ? <KnowledgeText>Selected: {photo.name}</KnowledgeText> : base?.geoTaggedPicture && !removePhoto ? <Button label="Open vendor picture" variant="secondary" disabled={busy} onPress={() => void viewFile(base.geoTaggedPicture!, `vendor-picture.${base.geoTaggedPicture!.mimeType.split("/")[1]}`)} /> : <KnowledgeText>{removePhoto ? "Picture will be removed on save." : "No vendor picture."}</KnowledgeText>}
      {context.canUpdate && !readOnly ? <><Button label={photo || base?.geoTaggedPicture ? "Replace vendor picture" : "Choose vendor picture"} variant="secondary" disabled={blocked || !policy.isSuccess} onPress={() => void chooseFile("photo")} />{photo || (base?.geoTaggedPicture && !removePhoto) ? <Button label="Remove picture" variant="danger" disabled={blocked} onPress={() => { setPhoto(null); setRemovePhoto(Boolean(base?.geoTaggedPicture)); photoCommand.current = null; }} /> : null}</> : null}
    </KnowledgeCard>
    {policy.isError && !readOnly ? <StateView title="Upload requirements unavailable" message={catalogError(policy.error)} actionLabel="Retry upload requirements" onAction={() => void policy.refetch()} /> : null}
    {fileError ? <KnowledgeText error>{fileError}</KnowledgeText> : null}
    {progress !== null ? <KnowledgeText>{Math.round(progress * 100)}% uploaded</KnowledgeText> : null}
    {!readOnly ? <Button label={base ? "Save vendor changes" : "Save vendor"} disabled={blocked} loading={save.isPending} onPress={submit} /> : null}
    {base ? <Button label="Review missing historical allocations" variant="secondary" disabled={busy || dirty || recovery || partial || accessError} onPress={() => setBaselineOpen(true)} /> : null}
    {baselineOpen && base ? <KnowledgeVendorBaseline context={context} vendorId={base.id} canUpdate={context.canUpdate && base.status !== "archived"} onClose={() => setBaselineOpen(false)} /> : null}
    {basketEditor ? <KnowledgeBasketEditor context={context} {...(basketEditor === "sub" && currentBasket ? { parent: currentBasket } : {})} onClose={() => setBasketEditor(null)} onSaved={() => { setBasketEditor(null); void baskets.refetch(); void subBaskets.refetch(); }} /> : null}
  </KnowledgeModal>;
}
