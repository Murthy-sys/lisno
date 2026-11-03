import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster, ProcurementVendorDetail } from "../ai-estimator-knowledge/knowledgeTypes";
import { useUnsavedKnowledgeGuard } from "../ai-estimator-knowledge/useUnsavedKnowledgeGuard";
import { VendorBasketFields } from "./VendorBasketFields";
import { procurementRequestKey } from "./procurementPresentation";
import { getVendorDetail, updateVendorClassification, type VendorClassificationInput } from "./vendorProfileApi";
import "./vendorProcurement.css";

interface Props {
  vendorId: string;
  canUpdate: boolean;
  origin?: { basketId: string; subBasketId?: string };
  onClose: () => void;
  onSaved: (vendor: KnowledgeMaster) => void | Promise<void>;
}
const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);
const uncertain = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status < 400 || error.status === 408;
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const ignore = () => undefined;
const unique = (ids: (string | undefined | null)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();

function selectionFor(vendor: ProcurementVendorDetail) {
  const profile = vendor.procurementProfile;
  const summary = vendor.procurementSummary;
  return {
    main: unique([...(profile?.mainBasketIds ?? []), profile?.mainBasketId, ...summary.mainBaskets.map(({ id }) => id), summary.mainBasket?.id]),
    sub: unique([...(profile?.subBasketIds ?? []), profile?.subBasketId, ...summary.subBaskets.map(({ id }) => id), summary.subBasket?.id])
  };
}

export function VendorBasketAssignmentEditor(props: Props) {
  const auth = useAuth();
  const canRead = Boolean(auth.user) && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read");
  const query = useQuery({
    queryKey: [...knowledgeQueryKeys.vendorDetails(), "classification", auth.user?.id ?? "", props.vendorId],
    queryFn: ({ signal }) => getVendorDetail(props.vendorId, signal),
    enabled: canRead, gcTime: 0, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false
  });
  if (!canRead || denied(query.error)) return <ContextPanel title="Manage basket assignments" eyebrow="Vendor details" onClose={props.onClose}>
    <PageState state="error" message="You do not have permission to view this vendor's assignments." />
  </ContextPanel>;
  if (!query.data) return <ContextPanel title="Manage basket assignments" eyebrow="Vendor details" onClose={props.onClose}>
    <PageState state={query.isError ? "error" : "loading"} message={query.isError ? message(query.error, "Vendor assignments could not be loaded.") : "Loading vendor assignments…"}
      action={query.isError ? { label: "Retry vendor assignments", onAction: () => void query.refetch() } : undefined} />
  </ContextPanel>;
  const canEdit = props.canUpdate && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.update")
    && (query.data.status !== "archived" || (auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle")));
  return <AssignmentForm key={`${auth.user?.id}:${props.vendorId}`} {...props} initial={query.data} canEdit={canEdit} loadFailed={query.isError}
    onReload={async () => {
      const refreshed = await query.refetch({ throwOnError: true });
      if (!refreshed.data) throw new Error("Vendor assignments could not be loaded.");
      return refreshed.data;
    }} />;
}

function AssignmentForm({ initial, canEdit, loadFailed, origin, onClose, onSaved, onReload }: Props & {
  initial: ProcurementVendorDetail; canEdit: boolean; loadFailed: boolean; onReload: () => Promise<ProcurementVendorDetail>;
}) {
  const id = useId();
  const [base, setBase] = useState(initial);
  const [selection, setSelection] = useState(() => selectionFor(initial));
  const [reason, setReason] = useState("");
  const [catalogBlocked, setCatalogBlocked] = useState(true);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [saved, setSaved] = useState<KnowledgeMaster | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const command = useRef<VendorClassificationInput | null>(null);
  const locked = useRef(false);
  const save = useMutation({ mutationFn: (input: VendorClassificationInput) => updateVendorClassification(base.id, input), retry: false });
  const originalSelection = selectionFor(base);
  const changed = JSON.stringify(selection) !== JSON.stringify(originalSelection);
  const dirty = !saved && (changed || Boolean(reason));
  const busy = save.isPending || reloading || refreshing;
  const canLeave = !busy && !uncertainSave;
  const guard = useUnsavedKnowledgeGuard({
    hasUnsavedChanges: dirty || save.isPending || uncertainSave,
    onSave: async () => false,
    onDiscard: () => canLeave
  });
  const fieldErrors = saveError instanceof ApiError ? saveError.fields : undefined;
  const errors: Record<string, string> = {};
  if (!selection.main.length) errors.mainBasketIds = "Choose a replacement Main Basket before removing the final assignment.";
  if (!selection.sub.length) errors.subBasketIds = "Choose a replacement Sub Basket. At least one Main Basket/Sub Basket pair must remain.";
  for (const field of ["mainBasketIds", "subBasketIds"] as const) {
    const serverError = fieldErrors?.[`procurementProfile.${field}`] ?? fieldErrors?.[field];
    if (serverError) errors[field] = serverError;
  }
  const canSave = canEdit && changed && selection.main.length > 0 && selection.sub.length > 0 && Boolean(reason.trim())
    && !catalogBlocked && !loadFailed && !busy && !conflict && !saved && !denied(saveError);
  const frozen = busy || uncertainSave || conflict || loadFailed || Boolean(saved) || !canEdit;
  const primaryMain = base.procurementSummary.mainBasket;
  const mainName = base.procurementSummary.mainBaskets.find(({ id }) => id === origin?.basketId)?.name
    ?? (primaryMain && primaryMain.id === origin?.basketId ? primaryMain.name : null);
  const subName = base.procurementSummary.subBaskets.find(({ id }) => id === origin?.subBasketId)?.name;

  async function publish(result: KnowledgeMaster) {
    setRefreshing(true); setRefreshError("");
    try { await onSaved(result); }
    catch { setRefreshError("Assignments were saved, but the latest vendor details could not refresh. Retry the refresh; the correction will not be saved again."); }
    finally { setRefreshing(false); }
  }

  async function submit() {
    if (locked.current || (!canSave && !(uncertainSave && canEdit && !busy))) return;
    locked.current = true;
    command.current ??= { expectedVersion: base.version, mainBasketIds: selection.main, subBasketIds: selection.sub, reason: reason.trim(), idempotencyKey: procurementRequestKey() };
    setSaveError(null);
    try {
      const result = await save.mutateAsync(command.current);
      setUncertainSave(false); setSaved(result); command.current = null;
      await publish(result);
    } catch (error) {
      setSaveError(error);
      const unknown = uncertain(error);
      setUncertainSave(unknown);
      setConflict(error instanceof ApiError && error.status === 409);
      if (!unknown) command.current = null;
    } finally { locked.current = false; }
  }

  async function reload() {
    if (busy || uncertainSave) return;
    setReloading(true);
    try {
      const latest = await onReload();
      setBase(latest); setSelection(selectionFor(latest)); setReason("");
      setSaveError(null); setConflict(false); command.current = null;
    } catch (error) { setSaveError(error); }
    finally { setReloading(false); }
  }

  if (denied(saveError)) return <ContextPanel title="Manage basket assignments" eyebrow="Vendor details" onClose={onClose}>
    <PageState state="error" message="Your access to these assignments has changed. Close this panel and refresh your access." />
  </ContextPanel>;

  return <>
    <ContextPanel title="Manage basket assignments" eyebrow="Vendor details" description={`${base.name} · ${base.code}`}
      width="wide" className="vendor-profile" busy={busy} onClose={() => guard.requestNavigation(onClose)} contentInert={guard.dialogOpen}
      footer={<div className="vendor-procurement__actions">
        <Button variant="secondary" disabled={busy || uncertainSave} onClick={() => guard.requestNavigation(onClose)}>{saved ? "Done" : "Cancel"}</Button>
        {saved ? refreshError ? <Button busy={refreshing} onClick={() => void publish(saved)}>Retry vendor refresh</Button> : null
          : <Button type="submit" form={`${id}-form`} busy={save.isPending} disabled={uncertainSave ? !canEdit || busy : !canSave}>{uncertainSave ? "Retry same save" : "Save assignments"}</Button>}
      </div>}>
      <form id={`${id}-form`} className="vendor-profile__form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {origin ? <InlineMessage tone="info" title="Assignment blocking deletion">Review {origin.subBasketId ? `Sub Basket ${subName ?? origin.subBasketId}` : `Main Basket ${mainName ?? origin.basketId}`} and remove it from the selection or choose a replacement.</InlineMessage> : null}
        {base.status === "archived" ? <InlineMessage tone="info">This vendor remains archived. This correction changes only basket assignments.</InlineMessage> : null}
        {!canEdit ? <InlineMessage tone="warning">You do not have permission to change these assignments.</InlineMessage> : null}
        {saved ? <InlineMessage tone="success" role="status">Basket assignments saved. Review a fresh deletion impact before deleting the basket.</InlineMessage> : null}
        {refreshError ? <InlineMessage tone="warning" role="alert">{refreshError}</InlineMessage> : null}
        {saveError ? <InlineMessage tone="error" role="alert">{message(saveError, "Assignments could not be saved. Your selection is preserved.")}</InlineMessage> : null}
        {uncertainSave ? <InlineMessage tone="warning">The save result is uncertain. Retry the same save to confirm it before changing or leaving these assignments.</InlineMessage> : null}
        {(conflict || loadFailed) && !saved ? <InlineMessage tone="warning" title="Review current assignments">{loadFailed ? "The latest assignments could not be loaded. Your draft is preserved until you reload successfully." : "Another change may affect this vendor. Reload the current assignments before making a new correction."}
          <Button variant="secondary" busy={reloading} onClick={() => void reload()}>Discard draft and reload assignments</Button>
        </InlineMessage> : null}
        <VendorBasketFields mainBasketIds={selection.main} subBasketIds={selection.sub} original={base.procurementSummary} errors={errors}
          vendorId={base.id} canCreate={false} canRequestMainBasket={false} showCatalogUtilities={false} disabled={frozen} readOnly={!canEdit}
          onChange={(main, sub) => { setSelection({ main, sub }); setSaveError(null); command.current = null; }}
          onBusyChange={ignore} onDraftChange={ignore} onCatalogBlockedChange={setCatalogBlocked} />
        <Field id={`${id}-reason`} label="Correction reason" required hint="Recorded with the assignment change." error={fieldErrors?.reason}>
          {(props) => <Textarea {...props} value={reason} maxLength={1000} disabled={frozen} onChange={(event) => { setReason(event.target.value); setSaveError(null); command.current = null; }} />}
        </Field>
      </form>
    </ContextPanel>
    {guard.dialogOpen ? <Dialog title="Leave basket assignments?" eyebrow="Vendor details" onClose={guard.stayHere} role="alertdialog">
      <div className="ui-dialog__body">{canLeave ? "Your assignment changes have not been saved." : "Wait for the save to finish, or retry the same save to confirm its result before leaving."}</div>
      <div className="ui-dialog__actions"><Button variant="secondary" onClick={guard.stayHere}>Keep editing</Button><Button variant="destructive" disabled={!canLeave} onClick={guard.discardAndContinue}>Discard changes</Button></div>
    </Dialog> : null}
  </>;
}
