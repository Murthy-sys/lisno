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
import { listKnowledgeMasters } from "../ai-estimator-knowledge/knowledgeApi";
import { collectAllKnowledgeMasterPages } from "../ai-estimator-knowledge/knowledgeMasterPagination";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster, ProcurementVendorDetail } from "../ai-estimator-knowledge/knowledgeTypes";
import { createVendorProfile, getVendorDetail, removeVendorPhoto, updateVendorProfile, uploadVendorPhoto, type VendorProfileInput } from "./vendorProfileApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { normalizeExecutionTypes, profileFromDraft, validateVendorDraft, vendorDraft, type VendorDraft } from "./vendorProfileDraft";
import { VendorProfileFields } from "./VendorProfileFields";
import { VendorBasketFields } from "./VendorBasketFields";
import { VendorPhotoPreview } from "./VendorPhotoPreview";
import { VendorAllocationBaseline } from "./VendorAllocationBaseline";

const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
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
  const pendingInput = useRef<VendorProfileInput | null>(null);
  const savedIdentity = useRef<KnowledgeMaster | null>(null);
  const photoCommand = useRef<{ id: string; version: number; key: string; file: File | null; remove: boolean } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(vendorDraft(base)) || Boolean(photo) || removePhoto;
  const readOnly = Boolean(base && (!canUpdate || base.status === "archived"));

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
  async function recoverCreate(input: VendorProfileInput): Promise<ProcurementVendorDetail | null> {
    const all = await collectAllKnowledgeMasterPages((page) => listKnowledgeMasters("vendors", { ...page, search: input.name }), "Vendor");
    const matching = all.items.filter((vendor) => normalize(vendor.name) === normalize(input.name));
    if (!matching.length) return null;
    if (matching.length !== 1) throw new Error("The vendor name is ambiguous. Review the directory before another attempt.");
    const detail = await getVendorDetail(matching[0].id);
    if (!detail.procurementProfile || Object.entries(input.procurementProfile).some(([key, value]) => {
      if (key === "executionType") {
        const saved = detail.procurementProfile!.executionType;
        return (saved === null) !== (value === null) || JSON.stringify(normalizeExecutionTypes(saved)) !== JSON.stringify(normalizeExecutionTypes(input.procurementProfile.executionType));
      }
      return detail.procurementProfile![key as keyof typeof input.procurementProfile] !== value;
    })) {
      throw new Error("An existing vendor uses this Entity Name with different details. Review that vendor before saving; it has not been overwritten.");
    }
    savedIdentity.current = matching[0]; return detail;
  }
  const save = useMutation({ mutationFn: async (input: VendorProfileInput) => {
    pendingInput.current = input;
    let summary: KnowledgeMaster;
    try {
      summary = base ? await updateVendorProfile(base.id, { ...input, expectedVersion: base.version }) : await createVendorProfile(input);
    } catch (error) {
      if (!base && (uncertainResponse(error) || (error instanceof ApiError && error.status === 409))) {
        setRecovery(true);
        const found = await recoverCreate(input);
        if (found) { setRecovery(false); await publish(found); setDraft(vendorDraft(found)); await finishPhoto(found); return; }
        setRecovery(false);
      }
      throw error;
    }
    savedIdentity.current = summary;
    setPartial(Boolean(photo || removePhoto));
    const detail = await getVendorDetail(summary.id);
    await publish(detail); setDraft(vendorDraft(detail)); setConfirmAddress(false);
    await finishPhoto(detail);
  }, onError: (error) => {
    if (error instanceof ApiError && error.fields) setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, value]) => [key.replace(/^procurementProfile\./, ""), value])));
  }, onSettled: () => { submission.current = false; } });
  const retry = useMutation({ mutationFn: async () => {
    if (savedIdentity.current || base) {
      const detail = await getVendorDetail((savedIdentity.current ?? base)!.id);
      await publish(detail); setDraft(vendorDraft(detail));
      // Removal has no idempotency key; a read confirms an already committed removal.
      if (photoCommand.current?.remove && !detail.geoTaggedPicture) { setRemovePhoto(false); photoCommand.current = null; setPartial(false); onSaved(detail); onClose(); return; }
      await finishPhoto(detail);
    } else if (pendingInput.current) {
      const found = await recoverCreate(pendingInput.current);
      if (found) { setRecovery(false); await publish(found); setDraft(vendorDraft(found)); await finishPhoto(found); }
      else { setRecovery(false); save.reset(); setNotice("No matching vendor was found. You can try saving again."); }
    }
  } });
  const reload = useMutation({ mutationFn: () => getVendorDetail(base!.id), onSuccess: (detail) => {
    setBase(detail); setDraft(vendorDraft(detail)); setConfirmAddress(false); setErrors({}); save.reset(); retry.reset();
    photoCommand.current = null; savedIdentity.current = null; setPartial(false);
    setNotice("Latest vendor loaded. Review your selected picture before saving.");
  } });
  const busy = save.isPending || retry.isPending || reload.isPending || nestedBusy || baselineBusy;
  const hasSavedWrite = Boolean(savedIdentity.current) && save.isError;
  const conflict = save.error instanceof ApiError && save.error.code === "VERSION_CONFLICT" && !recovery && !hasSavedWrite;
  const photoConflict = (retry.error ?? save.error) instanceof ApiError && ((retry.error ?? save.error) as ApiError).code === "VERSION_CONFLICT" && Boolean(photoCommand.current);
  const blocked = baselineDirty || readOnly || accessError || busy || recovery || partial || hasSavedWrite || conflict;
  function change<K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value,
      ...(key === "vendorType" ? { executionType: [], supplier: "" } : {}),
      ...(key === "currentAddress" ? { currentAddressVerifiedPhysically: "" } : {}) }));
    if (key === "currentAddress") setConfirmAddress(false);
    if (key === "currentAddressVerifiedPhysically") setConfirmAddress(value === "yes");
    setErrors((previous) => ({ ...previous, [key]: "" }));
    if (!conflict) save.reset();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || nestedDraft || submission.current) return;
    const next = { ...validateVendorDraft(draft), ...(errors.photo ? { photo: errors.photo } : {}) }; setErrors(next);
    if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    submission.current = true; savedIdentity.current = null;
    save.mutate({ name: draft.name.trim(), description: draft.description.trim() || null, procurementProfile: profileFromDraft(draft), ...(base ? { status: draft.status } : {}), confirmPhysicalAddressVerification: confirmAddress });
  }
  return <ContextPanel title={base ? "Vendor details" : "Add vendor"} eyebrow="Procurement" width="wide" className="vendor-profile" dirty={dirty || baselineDirty || nestedDraft} busy={busy} onClose={onClose}
    description={base ? `${base.name} · ${base.code}` : "Create a vendor in the shared directory."}
    footer={({ requestClose }) => <div className="vendor-procurement__actions"><Button variant="secondary" disabled={busy} onClick={requestClose}>{readOnly ? "Close" : "Cancel"}</Button>{!readOnly ? <Button type="submit" form={`${id}-form`} disabled={blocked || nestedDraft} busy={save.isPending}>{base ? "Save changes" : "Save vendor"}</Button> : null}</div>}>
    <form id={`${id}-form`} ref={form} onSubmit={submit} noValidate className="vendor-profile__form">
      {accessError ? <InlineMessage tone="error">Vendor details could not be refreshed. Close and reopen this vendor before saving.</InlineMessage> : null}
      {!base?.procurementProfile && base ? <InlineMessage tone="info">This vendor has an incomplete profile. Existing project references remain available.</InlineMessage> : null}
      {Object.values(errors).filter(Boolean).length ? <InlineMessage tone="error" role="alert">Review the required fields and highlighted errors before saving.</InlineMessage> : null}
      {save.isError || retry.isError ? <InlineMessage tone="error" role="alert">{partial ? "Vendor saved, but the picture has not been confirmed. " : hasSavedWrite ? "Vendor saved, but its latest details could not be loaded. " : ""}{procurementError(retry.error ?? save.error, (retry.error ?? save.error) instanceof Error ? ((retry.error ?? save.error) as Error).message : "The vendor could not be saved. Your entries are preserved.")}</InlineMessage> : null}
      {recovery || partial || hasSavedWrite ? <Button variant="secondary" busy={retry.isPending} disabled={busy} onClick={() => retry.mutate()}>{partial ? "Retry picture attachment" : "Check saved vendor"}</Button> : null}
      {(conflict || photoConflict) && base ? <InlineMessage tone="warning" action={<Button variant="secondary" busy={reload.isPending} onClick={() => reload.mutate()}>Reload latest and replace entries</Button>}>This vendor changed. Your entries are preserved until you reload the latest record.</InlineMessage> : null}
      {reload.isError ? <InlineMessage tone="error">{procurementError(reload.error, "The latest vendor could not be loaded.")}</InlineMessage> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <fieldset className="vendor-profile__fields" disabled={blocked}>
        <VendorProfileFields draft={draft} errors={errors} existing={Boolean(base)} onChange={change} />
        <PanelSection className="vendor-profile__section vendor-profile__section--baskets" icon={<Layers aria-hidden="true" />} title="Procurement Classification" description="Select categories from the configuration.">
          <VendorBasketFields mainBasketId={draft.mainBasketId} subBasketId={draft.subBasketId} original={base?.procurementSummary} errors={errors} canCreate={canCreateBasket && !readOnly} disabled={blocked} onBusyChange={setNestedBusy} onDraftChange={setNestedDraft} onChange={(main, sub) => { change("mainBasketId", main); change("subBasketId", sub); }} />
        </PanelSection>
        <PanelSection className="vendor-profile__section vendor-profile__section--documentation" icon={<ImageIcon aria-hidden="true" />} title="Vendor Documentation" description="Optional geo-tagged picture of the vendor.">
          <Field id={`${id}-photo`} label="Geo Tagged Picture of the Vendor" hint="Optional JPEG, PNG or WebP. Original embedded geotags are preserved; the picture does not verify the address." error={errors.photo}>{(props) => <div className="vendor-profile__dropzone"><span className="vendor-profile__dropzone-icon" aria-hidden="true"><Upload aria-hidden="true" /></span><span className="vendor-profile__dropzone-text" aria-hidden="true"><strong>Click to upload</strong> or drag and drop</span><FileInput {...props} disabled={!canUpdate} key={photoRevision} accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!file.size || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setErrors((previous) => ({ ...previous, photo: "Choose a nonempty JPEG, PNG or WebP image." })); return; } setPhoto(file); setRemovePhoto(false); photoCommand.current = null; setErrors((previous) => ({ ...previous, photo: "" })); }} /></div>}</Field>
          <VendorPhotoPreview file={photo} photo={removePhoto ? null : base?.geoTaggedPicture ?? null} />
          {photo || (base?.geoTaggedPicture && !removePhoto) ? <Button variant="secondary" disabled={!canUpdate} onClick={() => { setPhoto(null); setRemovePhoto(Boolean(base?.geoTaggedPicture)); photoCommand.current = null; setPhotoRevision((value) => value + 1); }}>Remove picture</Button> : null}
          {removePhoto ? <p role="status">Picture removal will be saved with your changes.</p> : null}
        </PanelSection>
      </fieldset>
    </form>
    {base ? <VendorAllocationBaseline vendorId={base.id} canUpdate={canUpdate && base.status !== "archived"} disabled={busy || dirty || accessError || partial || recovery} onBusyChange={setBaselineBusy} onDirtyChange={setBaselineDirty} /> : null}
  </ContextPanel>;
}
