import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Layers, Upload } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, FileInput } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { PanelSection } from "../../components/ui/PanelSection";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster, ProcurementVendorDetail } from "../ai-estimator-knowledge/knowledgeTypes";
import { createVendorProfile, getVendorDetail, removeVendorPhoto, updateVendorProfile, uploadVendorPhoto, type VendorProfileInput } from "./vendorProfileApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { hasVendorBankAccount, profileFromDraft, validateVendorDraft, vendorDraft, VENDOR_BANK_FIELDS, type VendorDraft } from "./vendorProfileDraft";
import { VendorProfileFields } from "./VendorProfileFields";
import { VendorBasketFields } from "./VendorBasketFields";
import { VendorPhotoPreview } from "./VendorPhotoPreview";
import { VendorMsmeCertificateField } from "./VendorMsmeCertificateField";
import { useVendorMsmeCertificate } from "./useVendorMsmeCertificate";
import { VendorAllocationBaseline } from "./VendorAllocationBaseline";

const uncertainResponse = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status < 400 || error.status === 408;

export function ProcurementVendorEditor({ existing, canCreateBasket, canUpdate, onClose, onSaved }: {
  existing?: KnowledgeMaster; canCreateBasket: boolean; canUpdate: boolean; onClose: () => void; onSaved: (vendor: KnowledgeMaster) => void;
}) {
  const query = useQuery({ queryKey: knowledgeQueryKeys.vendorDetail(existing?.id ?? "new"), queryFn: ({ signal }) => getVendorDetail(existing!.id, signal), enabled: Boolean(existing), gcTime: 0, refetchOnWindowFocus: false });
  if (existing && !query.data) return <ContextPanel title="Vendor details" eyebrow="Procurement" onClose={onClose} width="wide"><PageState state={query.isError ? "error" : "loading"} message={query.isError ? procurementError(query.error, "Vendor details could not be loaded.") : "Loading vendor details…"} action={query.isError ? { label: "Retry vendor details", onAction: () => void query.refetch() } : undefined} /></ContextPanel>;
  return <VendorForm initial={query.data} canCreateBasket={canCreateBasket} canUpdate={canUpdate} onClose={onClose} onSaved={onSaved} accessError={query.isError} />;
}

function VendorForm({ initial, canCreateBasket, canUpdate, onClose, onSaved, accessError }: {
  initial?: ProcurementVendorDetail; canCreateBasket: boolean; canUpdate: boolean; onClose: () => void; onSaved: (vendor: KnowledgeMaster) => void; accessError: boolean;
}) {
  const id = useId();
  const client = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => vendorDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nestedBusy, setNestedBusy] = useState(false);
  const [nestedDraft, setNestedDraft] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [baselineDirty, setBaselineDirty] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState(false);
  const [partial, setPartial] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState("");
  const [photoRevision, setPhotoRevision] = useState(0);
  const submission = useRef(false);
  const pendingCommand = useRef<{ input: VendorProfileInput; id?: string; expectedVersion?: number } | null>(null);
  const savedIdentity = useRef<KnowledgeMaster | null>(null);
  const photoCommand = useRef<{ id: string; version: number; key: string; file: File | null; remove: boolean } | null>(null);
  const readOnly = Boolean(base && (!canUpdate || base.status === "archived"));
  const certificate = useVendorMsmeCertificate(draft.msmeRegistered === "yes" && !readOnly);
  const dirty = JSON.stringify(draft) !== JSON.stringify(vendorDraft(base)) || Boolean(photo) || removePhoto || Boolean(certificate.file);

  async function publish(detail: ProcurementVendorDetail) {
    setBase(detail);
    client.setQueryData(knowledgeQueryKeys.vendorDetail(detail.id), detail);
    // Do not pass the private detail to the shared catalog commit helper.
    await syncKnowledgeMasterMutation(client, "vendors");
  }
  async function finishPhoto(detail: ProcurementVendorDetail) {
    if (photo || removePhoto) {
      setPartial(true);
      photoCommand.current ??= { id: detail.id, version: detail.version, key: procurementRequestKey(), file: photo, remove: removePhoto };
      const command = photoCommand.current;
      const result = command.file ? await uploadVendorPhoto(command.id, command.file, command.version, command.key) : await removeVendorPhoto(command.id, command.version);
      if (result.vendorId !== detail.id) throw new Error("The photo response belongs to another vendor.");
      detail = { ...detail, version: result.version, geoTaggedPicture: result.geoTaggedPicture };
      setPhoto(null); setRemovePhoto(false); photoCommand.current = null; setPhotoRevision((value) => value + 1);
      await publish(detail);
    }
    setPartial(false); setRecovery(false); setNotice("Vendor saved."); onSaved(detail); onClose();
  }
  async function performSave(input: VendorProfileInput) {
    if (!pendingCommand.current) {
      const uploadId = input.procurementProfile.msmeRegistered ? await certificate.stage(base ? { id: base.id, expectedVersion: base.version } : undefined) : undefined;
      pendingCommand.current = { id: base?.id, expectedVersion: base?.version, input: { ...input, idempotencyKey: procurementRequestKey(), ...(uploadId ? { msmeCertificateUploadId: uploadId } : {}) } };
    }
    const command = pendingCommand.current;
    let summary: KnowledgeMaster;
    try {
      summary = command.id ? await updateVendorProfile(command.id, { ...command.input, expectedVersion: command.expectedVersion! }) : await createVendorProfile(command.input);
    } catch (error) {
      // Only the same server command can prove whether an uncertain request committed.
      // Keep its body, version and key frozen until the server gives a definite result.
      setRecovery(uncertainResponse(error));
      if (!uncertainResponse(error)) pendingCommand.current = null;
      throw error;
    }
    savedIdentity.current = summary; setRecovery(false);
    setPartial(Boolean(photo || removePhoto));
    const detail = await getVendorDetail(summary.id);
    await publish(detail); setDraft(vendorDraft(detail)); setConfirmAddress(false); certificate.select(null);
    await finishPhoto(detail);
  }
  function saveError(error: unknown) {
    if (error instanceof ApiError && error.fields) {
      setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, value]) => [key.replace(/^procurementProfile\./, "").replace(/^msmeCertificateUploadId$/, "msmeCertificate"), value])));
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  }
  const save = useMutation({ mutationFn: performSave, onError: saveError, onSettled: () => { submission.current = false; } });
  const retry = useMutation({ mutationFn: async () => {
    if (savedIdentity.current) {
      const detail = await getVendorDetail(savedIdentity.current.id);
      await publish(detail); setDraft(vendorDraft(detail)); certificate.select(null);
      // Removal has no idempotency key; a read confirms an already committed removal.
      if (photoCommand.current?.remove && !detail.geoTaggedPicture) { setRemovePhoto(false); photoCommand.current = null; setPartial(false); onSaved(detail); onClose(); return; }
      await finishPhoto(detail);
    } else if (pendingCommand.current) await performSave(pendingCommand.current.input);
  }, onError: saveError });
  const reload = useMutation({ mutationFn: () => getVendorDetail(base!.id), onSuccess: (detail) => {
    setBase(detail); setDraft(vendorDraft(detail)); setConfirmAddress(false); setErrors({}); save.reset(); retry.reset();
    photoCommand.current = null; savedIdentity.current = null; pendingCommand.current = null; certificate.resetStage(); setPartial(false); setRecovery(false);
    setNotice("Latest vendor loaded. Review your selected files before saving.");
  } });
  const busy = save.isPending || retry.isPending || reload.isPending || nestedBusy || baselineBusy;
  const hasSavedWrite = Boolean(savedIdentity.current) && save.isError;
  const currentError = retry.error ?? save.error;
  const conflict = currentError instanceof ApiError && currentError.code === "VERSION_CONFLICT" && !recovery && !hasSavedWrite;
  const photoConflict = (retry.error ?? save.error) instanceof ApiError && ((retry.error ?? save.error) as ApiError).code === "VERSION_CONFLICT" && Boolean(photoCommand.current);
  const blocked = baselineDirty || readOnly || accessError || busy || recovery || partial || hasSavedWrite || conflict;
  function change<K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value,
      ...(key === "vendorType" ? { executionType: [] } : {}),
      ...(key === "currentAddress" ? { currentAddressVerifiedPhysically: "" } : {}) }));
    if (key === "currentAddress") setConfirmAddress(false);
    if (key === "currentAddressVerifiedPhysically") setConfirmAddress(value === "yes");
    setErrors((previous) => {
      const next: Record<string, string> = { ...previous, [key]: "", ...(key === "vendorType" ? { executionType: "" } : {}), ...(key === "gstRegistered" ? { gstNumber: "" } : {}), ...(key === "msmeRegistered" ? { msmeCertificate: "" } : {}) };
      if (key in VENDOR_BANK_FIELDS) {
        delete next.bankAccount;
        delete next[`bankAccount.${key}`];
        if (!hasVendorBankAccount({ ...draft, [key]: value })) for (const bankField of Object.keys(VENDOR_BANK_FIELDS)) delete next[`bankAccount.${bankField}`];
      }
      return next;
    });
    pendingCommand.current = null;
    if (!conflict) { save.reset(); retry.reset(); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || nestedDraft || submission.current) return;
    const certificateError = draft.msmeRegistered === "yes" ? certificate.validation(base?.msmeCertificate) : undefined;
    const next = { ...validateVendorDraft(draft, { requireOrganizationType: !base }), ...(errors.photo ? { photo: errors.photo } : {}), ...(certificateError ? { msmeCertificate: certificateError } : {}) }; setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    submission.current = true; savedIdentity.current = null;
    save.mutate({ name: draft.name.trim(), procurementProfile: profileFromDraft(draft), ...(base ? { status: draft.status } : {}), confirmPhysicalAddressVerification: confirmAddress });
  }
  return <ContextPanel title={base ? "Vendor details" : "Add vendor"} eyebrow="Procurement" width="wide" className="vendor-profile" dirty={dirty || baselineDirty || nestedDraft} busy={busy} onClose={onClose}
    description={base ? `${base.name} · ${base.code}` : "Create a vendor in the shared directory."}
    footer={({ requestClose }) => <div className="vendor-procurement__actions"><Button variant="secondary" disabled={busy} onClick={requestClose}>{readOnly ? "Close" : "Cancel"}</Button>{!readOnly ? <Button type="submit" form={`${id}-form`} disabled={blocked || nestedDraft} busy={save.isPending}>{base ? "Save changes" : "Save vendor"}</Button> : null}</div>}>
    <form id={`${id}-form`} ref={form} onSubmit={submit} noValidate className="vendor-profile__form">
      {accessError ? <InlineMessage tone="error">Vendor details could not be refreshed. Close and reopen this vendor before saving.</InlineMessage> : null}
      {!base?.procurementProfile && base ? <InlineMessage tone="info">This vendor has an incomplete profile. Existing project references remain available.</InlineMessage> : null}
      {Object.values(errors).filter(Boolean).length ? <InlineMessage tone="error" role="alert">Review the required fields and highlighted errors before saving.</InlineMessage> : null}
      {save.isError || retry.isError ? <InlineMessage tone="error" role="alert">{partial ? "Vendor saved, but the picture has not been confirmed. " : hasSavedWrite ? "Vendor saved, but its latest details could not be loaded. " : ""}{procurementError(retry.error ?? save.error, (retry.error ?? save.error) instanceof Error ? ((retry.error ?? save.error) as Error).message : "The vendor could not be saved. Your entries are preserved.")}</InlineMessage> : null}
      {recovery ? <InlineMessage tone="warning">The save result is uncertain. Retry the same save to confirm it before changing these entries.</InlineMessage> : null}
      {recovery || partial || hasSavedWrite ? <Button variant="secondary" busy={retry.isPending} disabled={busy} onClick={() => retry.mutate()}>{partial ? "Retry picture attachment" : recovery ? "Retry vendor save" : "Check saved vendor"}</Button> : null}
      {(conflict || photoConflict) && base ? <InlineMessage tone="warning" action={<Button variant="secondary" busy={reload.isPending} onClick={() => reload.mutate()}>Reload latest and replace entries</Button>}>This vendor changed. Your entries are preserved until you reload the latest record.</InlineMessage> : null}
      {reload.isError ? <InlineMessage tone="error">{procurementError(reload.error, "The latest vendor could not be loaded.")}</InlineMessage> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <fieldset className="vendor-profile__fields" disabled={blocked && !readOnly}>
        <VendorProfileFields draft={draft} errors={errors} existing={Boolean(base)} disabled={readOnly} onChange={change}
          certificateField={<VendorMsmeCertificateField certificate={base?.msmeCertificate} upload={certificate} error={errors.msmeCertificate} readOnly={readOnly} onSelect={(file) => { certificate.select(file); pendingCommand.current = null; save.reset(); retry.reset(); setErrors((previous) => ({ ...previous, msmeCertificate: "" })); }} />} />
        <PanelSection className="vendor-profile__section vendor-profile__section--baskets" icon={<Layers aria-hidden="true" />} title="Procurement Classification" description="Select categories from the configuration.">
          <VendorBasketFields mainBasketId={draft.mainBasketId} subBasketId={draft.subBasketId} original={base?.procurementSummary} errors={errors} canCreate={canCreateBasket && !readOnly} disabled={blocked} onBusyChange={setNestedBusy} onDraftChange={setNestedDraft} onChange={(main, sub) => { change("mainBasketId", main); change("subBasketId", sub); }} />
        </PanelSection>
        <PanelSection className="vendor-profile__section vendor-profile__section--documentation" icon={<ImageIcon aria-hidden="true" />} title="Vendor Documentation" description="Optional geo-tagged picture of the vendor.">
          <Field id={`${id}-photo`} label="Geo Tagged Picture of the Vendor" hint="Optional JPEG, PNG or WebP. Original embedded geotags are preserved; the picture does not verify the address." error={errors.photo}>{(props) => <div className="vendor-profile__dropzone"><span className="vendor-profile__dropzone-icon" aria-hidden="true"><Upload aria-hidden="true" /></span><span className="vendor-profile__dropzone-text" aria-hidden="true"><strong>Click to upload</strong> or drag and drop</span><FileInput {...props} disabled={readOnly || !canUpdate} key={photoRevision} accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!file.size || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setErrors((previous) => ({ ...previous, photo: "Choose a nonempty JPEG, PNG or WebP image." })); return; } setPhoto(file); setRemovePhoto(false); photoCommand.current = null; setErrors((previous) => ({ ...previous, photo: "" })); }} /></div>}</Field>
          <VendorPhotoPreview file={photo} photo={removePhoto ? null : base?.geoTaggedPicture ?? null} />
          {photo || (base?.geoTaggedPicture && !removePhoto) ? <Button variant="secondary" disabled={readOnly || !canUpdate} onClick={() => { setPhoto(null); setRemovePhoto(Boolean(base?.geoTaggedPicture)); photoCommand.current = null; setPhotoRevision((value) => value + 1); }}>Remove picture</Button> : null}
          {removePhoto ? <p role="status">Picture removal will be saved with your changes.</p> : null}
        </PanelSection>
      </fieldset>
    </form>
    {base ? <VendorAllocationBaseline vendorId={base.id} canUpdate={canUpdate && base.status !== "archived"} disabled={busy || dirty || accessError || partial || recovery} onBusyChange={setBaselineBusy} onDirtyChange={setBaselineDirty} /> : null}
  </ContextPanel>;
}
