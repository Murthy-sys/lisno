import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { procurementError } from "../procurement/procurementPresentation";
import { getVendorPurchaseOrder, purchaseOrderKeys } from "../procurement/purchaseOrderApi";
import { getVendorWork, getVendorWorkDetail, submitVendorWork, updateVendorWorkProgress, uploadVendorWorkImage, vendorWorkKeys, type VendorWorkTask } from "./vendorWorkApi";
import "./vendorWork.css";

const statusLabel: Record<VendorWorkTask["status"], string> = {
  awaiting_vendor_access: "Ready", ready: "Ready", in_progress: "In progress", submitted_for_client: "With client",
  changes_requested: "Changes requested", client_approved: "Client approved", superseded: "Superseded"
};

function useIdempotency() {
  const keys = useRef(new Map<string, string>());
  return {
    key(action: string, payload: unknown) {
      const signature = `${action}:${JSON.stringify(payload)}`;
      let key = keys.current.get(signature);
      if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
      return key;
    },
    clear() { keys.current.clear(); }
  };
}

export function VendorWorkPage() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_work.read");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: vendorWorkKeys.all,
    queryFn: ({ pageParam }) => getVendorWork(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.offset + page.items.length < page.total ? page.offset + page.items.length : undefined,
    enabled: canRead
  });
  const tasks = list.data?.pages.flatMap((page) => page.items) ?? [];
  const projectIds = [...new Set(tasks.map((task) => task.projectId))];
  const selected = tasks.find((item) => item.id === selectedId) ?? null;
  return <section className="vendor-work" aria-labelledby="vendor-work-title">
    <PageHeader id="vendor-work-title" eyebrow="Vendor workspace" title="Assigned work" description="Update each approved order section, add site evidence when useful, and submit completed work to the client." />
    {!canRead ? <PageState state="error" message="You do not have permission to view vendor work." /> : list.isPending ? <PageState state="loading" message="Loading assigned work…" /> : list.isError && !list.data ? <PageState state="error" message={procurementError(list.error, "Assigned work could not be loaded.")} action={{ label: "Try again", onAction: () => void list.refetch() }} /> : <>
      {tasks.length ? <><div className="vendor-work__projects" aria-label="Project status controls">{projectIds.map((projectId) => <div key={projectId}><span>Project reference {projectId}</span><ProjectStatusButton projectId={projectId} participant /></div>)}</div><div className="vendor-work__layout"><div className="vendor-work__queue"><ul className="vendor-work__list" aria-label="Assigned vendor sections">{tasks.map((task) => <li key={task.id}><button type="button" className="vendor-work__row" aria-current={selectedId === task.id ? "true" : undefined} onClick={() => setSelectedId(task.id)}><span className="vendor-work__row-section">{task.sectionLabel}</span><strong>{task.itemName}</strong><span>{task.roomName} · {task.scopeType.replaceAll("_", " ")}</span><span className={`vendor-work__status vendor-work__status--${task.status}`}>{statusLabel[task.status]}</span><span className="vendor-work__progress">{task.displayProgress}% {task.progressSource === "site_manager" ? "· Site Manager verified" : "complete"}</span></button></li>)}</ul>{list.hasNextPage ? <Button variant="secondary" busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more assignments</Button> : null}{list.isFetchNextPageError ? <InlineMessage tone="error">{procurementError(list.error, "More assignments could not be loaded. Try again.")}</InlineMessage> : null}</div>
        {selected ? <VendorWorkDetail key={selected.id} taskId={selected.id} onClose={() => setSelectedId(null)} /> : <div className="vendor-work__empty"><p>Select a section to update progress or open its purchase order.</p></div>}
      </div></> : <PageState state="empty" message="No approved purchase order work has been assigned to this vendor account." />}
    </>}
  </section>;
}

function VendorWorkDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const auth = useAuth();
  const canUpdate = hasFrontendPermission(auth.authorization, "procurement.vendor_work.update");
  const canUpload = hasFrontendPermission(auth.authorization, "procurement.vendor_work.media.upload");
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: vendorWorkKeys.detail(taskId), queryFn: () => getVendorWorkDetail(taskId) });
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const idempotency = useIdempotency();
  const current = task.data;
  const canEdit = current && ["ready", "in_progress", "changes_requested"].includes(current.status);
  const percent = progress ?? String(current?.progress ?? 0);
  const currentNote = note ?? current?.note ?? "";
  const approvedOrder = useQuery({ queryKey: purchaseOrderKeys.vendorOrder(current?.orderId ?? ""), queryFn: () => getVendorPurchaseOrder(current!.orderId), enabled: Boolean(current?.orderId) });
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: vendorWorkKeys.detail(taskId) }),
      queryClient.invalidateQueries({ queryKey: vendorWorkKeys.all })
    ]);
  }
  const save = useMutation({
    mutationFn: ({ progress: next, note: text }: { progress: number; note: string }) => updateVendorWorkProgress(current!, next, text, idempotency.key("progress", { id: taskId, version: current!.version, next, text })),
    onSuccess: async () => { idempotency.clear(); setNotice("Progress saved."); setFormError(""); await refresh(); }
  });
  const upload = useMutation({
    mutationFn: (image: File) => uploadVendorWorkImage(current!, image, idempotency.key("image", { id: taskId, version: current!.version, name: image.name, size: image.size, lastModified: image.lastModified })),
    onSuccess: async () => { idempotency.clear(); setFile(null); setNotice("Image added to this review round."); await refresh(); }
  });
  const submit = useMutation({
    mutationFn: (text: string) => submitVendorWork(current!, text, idempotency.key("submit", { id: taskId, version: current!.version, text })),
    onSuccess: async () => { idempotency.clear(); setNotice("Section sent to the client for review."); await refresh(); }
  });
  function saveProgress(event: FormEvent) {
    event.preventDefault();
    const value = Number(percent);
    if (!Number.isInteger(value) || value < 0 || value > 100) return setFormError("Enter a whole progress percentage from 0 to 100.");
    if (currentNote.trim().length > 2000) return setFormError("Keep the note within 2,000 characters.");
    setFormError(""); save.mutate({ progress: value, note: currentNote.trim() });
  }
  function uploadImage() {
    if (!file) return setFormError("Choose an image to upload.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setFormError("Choose a JPEG, PNG, or WebP image.");
    setFormError(""); upload.mutate(file);
  }
  function submitSection() {
    if (current?.status !== "in_progress") return setFormError("Save a new progress update or upload an image for this review round before submitting.");
    if (current?.progress !== 100) return setFormError("Save progress at 100% before submitting this section.");
    if (!currentNote.trim()) return setFormError("Add a completion note for the client.");
    setFormError(""); submit.mutate(currentNote.trim());
  }
  return <article className="vendor-work__detail" aria-labelledby="vendor-work-detail-title">
    <div className="vendor-work__detail-head"><div><p className="eyebrow">Section detail</p><h2 id="vendor-work-detail-title">{current?.itemName ?? "Loading section"}</h2></div><Button variant="quiet" onClick={onClose}>Close</Button></div>
    {task.isPending ? <PageState state="loading" message="Loading section…" /> : task.isError ? <PageState state="error" message={procurementError(task.error, "This section could not be loaded.")} action={{ label: "Try again", onAction: () => void task.refetch() }} /> : current ? <>
      <div className="vendor-work__scope"><span className="vendor-work__row-section">{current.sectionLabel}</span><span>{current.roomName}</span><span>{statusLabel[current.status]}</span></div>
      <p className="vendor-work__description">{current.description}</p>
      <dl className="vendor-work__facts"><div><dt>Target date</dt><dd>{current.targetDate}</dd></div><div><dt>Delivery location</dt><dd>{current.deliveryLocation}</dd></div><div><dt>Review round</dt><dd>{current.currentRound}</dd></div><div><dt>Images added</dt><dd>{current.imageCount}</dd></div></dl>
      {current.progressSource === "site_manager" ? <InlineMessage tone="info">Site Manager marked this project 100% complete. Your reported section progress remains {current.progress}% and controls vendor submission.</InlineMessage> : null}
      {current.requestedChangeReason ? <InlineMessage tone="warning"><strong>Client requested changes:</strong> {current.requestedChangeReason}</InlineMessage> : null}
      {approvedOrder.isPending ? <p className="vendor-work__muted">Loading approved purchase order…</p> : approvedOrder.isError ? <InlineMessage tone="error">{procurementError(approvedOrder.error, "The approved purchase order could not be loaded.")}</InlineMessage> : approvedOrder.data ? <details className="vendor-work__order"><summary>View approved purchase order {approvedOrder.data.orderNumber}</summary><div className="vendor-work__order-body"><h3 className="vendor-work__print-title">Purchase order {approvedOrder.data.orderNumber}</h3><div className="vendor-work__order-top"><p>Revision {approvedOrder.data.revision} · Approved {new Date(approvedOrder.data.approvedAt).toLocaleDateString()}</p><Button variant="quiet" size="compact" onClick={() => window.print()}>Print purchase order</Button></div><p><strong>Vendor:</strong> {approvedOrder.data.vendor.name} ({approvedOrder.data.vendor.code}) · <strong>Project reference:</strong> {approvedOrder.data.projectId}</p><div className="vendor-work__order-lines">{approvedOrder.data.lines.map((line) => <div key={line.id}><span><strong>{line.itemName}</strong><small>{line.description} · {line.quantityMilliUnits / 1000} {line.uomCode} · {line.scopeType.replaceAll("_", " ")}</small><small>Target {line.targetDate} · {line.deliveryLocation} · GST {line.gstBasisPoints / 100}%</small></span><span>{formatPaise(line.totalPaise)}</span></div>)}</div><dl><div><dt>Before GST</dt><dd>{formatPaise(approvedOrder.data.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(approvedOrder.data.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(approvedOrder.data.totals.totalPaise)}</dd></div></dl><p className="vendor-work__terms"><strong>Terms:</strong> {approvedOrder.data.terms}</p></div></details> : null}
      {canEdit && canUpdate ? <form className="vendor-work__update" onSubmit={saveProgress} aria-label="Update section progress"><h3>Update progress</h3><div className="vendor-work__update-fields"><Field id={`vendor-progress-${taskId}`} label="Vendor reported progress (%)" required>{(props) => <Input {...props} type="number" min={0} max={100} step={1} value={percent} onChange={(event) => setProgress(event.target.value)} />}</Field><Field id={`vendor-note-${taskId}`} label="Work note" hint="Include the work completed and anything the client should check.">{(props) => <Textarea {...props} rows={3} maxLength={2000} value={currentNote} onChange={(event) => setNote(event.target.value)} />}</Field></div><div className="vendor-work__actions"><Button type="submit" variant="secondary" busy={save.isPending}>Save progress</Button></div></form> : null}
      {canEdit && canUpload ? <div className="vendor-work__upload"><h3>Site images</h3><p>Attach JPEG, PNG, or WebP images for this section and review round.</p><div className="vendor-work__upload-controls"><label htmlFor={`vendor-image-${taskId}`}>Choose image</label><Input id={`vendor-image-${taskId}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button variant="secondary" busy={upload.isPending} disabled={!file} onClick={uploadImage}>Upload image</Button></div></div> : null}
      {canEdit && canUpdate ? <div className="vendor-work__submit"><div><h3>Send for client review</h3><p>{current.status === "changes_requested" ? "Record a new progress update or upload a new image for this review round, then submit at 100%." : "Complete and save progress at 100%, then submit this section. The client can approve or request changes."}</p></div><Button disabled={current.status !== "in_progress" || current.progress !== 100 || !currentNote.trim() || save.isPending || upload.isPending} busy={submit.isPending} onClick={submitSection}>Submit completed section</Button></div> : null}
      {current.status === "submitted_for_client" ? <InlineMessage tone="info">This section is with the client. You can update it again if the client requests changes.</InlineMessage> : null}
      {current.status === "client_approved" ? <InlineMessage tone="success">The client approved this section.</InlineMessage> : null}
      {notice ? <p role="status" className="vendor-work__notice">{notice}</p> : null}
      {formError ? <InlineMessage tone="error">{formError}</InlineMessage> : null}
      {[save, upload, submit].map((mutation, index) => mutation.isError ? <InlineMessage key={index} tone="error">{procurementError(mutation.error, "This action could not be completed. Refresh the section and check its latest status before retrying.")}</InlineMessage> : null)}
    </> : null}
  </article>;
}
