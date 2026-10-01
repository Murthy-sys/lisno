import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { procurementError } from "./procurementPresentation";
import {
  getPurchaseOrderPreparation, listProjectPurchaseOrderRequests, purchaseOrderKeys,
  quoteProjectPurchaseOrderRequest, submitProjectPurchaseOrderRequest,
  type ProjectPurchaseOrderRequest, type PurchaseOrderPreparationItem, type PurchaseOrderRequestLineInput
} from "./purchaseOrderApi";

const GST_BASIS_POINTS = 1_800;
const VENDOR_TERMS = "Scope, delivery date and location are as shown on this order. Vendor confirmation is required before work begins.";
const statusLabel = {
  pending_approval: "Awaiting Super Admin", changes_requested: "Changes requested by Super Admin",
  rejected: "Rejected", approved: "Approved"
} satisfies Record<ProjectPurchaseOrderRequest["status"], string>;

export async function allProjectRequests(projectId: string): Promise<ProjectPurchaseOrderRequest[]> {
  const requests: ProjectPurchaseOrderRequest[] = [];
  let offset = 0;
  do {
    const page = await listProjectPurchaseOrderRequests(projectId, offset);
    requests.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) break;
  } while (true);
  return requests;
}

function withGst(netPaise: number) {
  const gstPaise = Number((BigInt(netPaise) * BigInt(GST_BASIS_POINTS) + 5_000n) / 10_000n);
  return { gstPaise, totalPaise: netPaise + gstPaise };
}

function unorderedItems(items: PurchaseOrderPreparationItem[]) {
  return items.filter((item) => !item.blockers.some((blocker) => blocker.code === "ALREADY_ORDERED"));
}

export function ProjectPurchaseOrderRequestPanel({ projectId, projectName, canManage }: {
  projectId: string; projectName: string; canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const preparation = useQuery({ queryKey: purchaseOrderKeys.preparation(projectId),
    queryFn: ({ signal }) => getPurchaseOrderPreparation(projectId, signal) });
  const requests = useQuery({ queryKey: purchaseOrderKeys.requests(projectId), queryFn: () => allProjectRequests(projectId) });
  const [notice, setNotice] = useState("");
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const source = preparation.data;
  const latest = requests.data?.[0] ?? null;
  const pending = requests.data?.find((request) => request.status === "pending_approval") ?? null;
  const correction = requests.data?.find((request) => request.status === "changes_requested") ?? null;
  const items = unorderedItems(source?.sections.flatMap((section) => section.items) ?? []);
  const netPaise = items.length && items.every((item) => item.plannedLineNetPaise !== null)
    ? items.reduce((sum, item) => sum + item.plannedLineNetPaise!, 0) : null;
  const gstPaise = netPaise === null ? null : items.reduce((sum, item) => sum + withGst(item.plannedLineNetPaise!).gstPaise, 0);
  const totalPaise = netPaise === null || gstPaise === null ? null : netPaise + gstPaise;
  const blockers = [
    ...items.flatMap((item) => item.blockers.filter((blocker) => blocker.code !== "ALREADY_ORDERED" && blocker.code !== "ALLOCATION_INSUFFICIENT")
      .map((blocker) => `${item.itemName}: ${blocker.message}`)),
    ...items.filter((item) => !item.vendor?.vendorType).map((item) => `${item.itemName}: Vendor type is needed.`),
    ...items.filter((item) => item.plannedLineNetPaise !== null && item.allocatedWorkPaise !== null &&
      withGst(item.plannedLineNetPaise).totalPaise > item.allocatedWorkPaise)
      .map((item) => `${item.itemName}${item.roomName ? ` (${item.roomName})` : ""}: ${item.plannedOrderQuantityMilliUnits! / 1000} ${item.uom.code} × ${formatPaise(item.pricePaise)} = ${formatPaise(item.plannedLineNetPaise!)}; GST (18%) ${formatPaise(withGst(item.plannedLineNetPaise!).gstPaise)}; order total ${formatPaise(withGst(item.plannedLineNetPaise!).totalPaise)}. Allocated work: ${formatPaise(item.allocatedWorkPaise!)}. Edit this item's allocation or quantity.`),
    ...(!source?.orderDefaults?.targetDate ? ["Set the project's planned end date before sending."] : []),
    ...(!source?.orderDefaults?.deliveryLocation ? ["Set the project location before sending."] : []),
    ...(source?.blockers.filter((blocker) => !blocker.itemId && blocker.code !== "ALREADY_ORDERED")
      .map((blocker) => blocker.message) ?? [])
  ];
  const canSend = canManage && Boolean(source) && !preparation.isPending && !preparation.isError &&
    !requests.isPending && !requests.isError && !pending && netPaise !== null && blockers.length === 0;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.requests(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.pendingRequests }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    ]);
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!source || !canSend || netPaise === null || gstPaise === null || totalPaise === null) throw new Error("Complete the order before sending.");
      const lines: PurchaseOrderRequestLineInput[] = items.map((item) => ({
        procurementItemId: item.id, expectedVersion: item.version, gstBasisPoints: GST_BASIS_POINTS,
        scopeType: item.vendor!.vendorType === "execution" ? "execution" : "supply",
        description: item.itemName, targetDate: source.orderDefaults!.targetDate!,
        deliveryLocation: source.orderDefaults!.deliveryLocation!
      }));
      const vendorTerms = [...new Set(items.map((item) => item.vendor!.id))]
        .map((vendorId) => ({ vendorId, terms: VENDOR_TERMS }));
      const input = { expectedPreparationDigest: source.digest, lines, vendorTerms };
      const quote = await quoteProjectPurchaseOrderRequest(projectId, input);
      if (quote.totals.netPaise !== netPaise || quote.totals.gstPaise !== gstPaise || quote.totals.totalPaise !== totalPaise) {
        throw new Error("The order amount changed. Refresh the project before sending.");
      }
      const payload = { ...input, ...(correction ? { expectedRequestVersion: correction.version } : {}) };
      const signature = JSON.stringify(payload);
      const key = keyRef.current?.signature === signature ? keyRef.current.key : crypto.randomUUID();
      keyRef.current = { signature, key };
      return submitProjectPurchaseOrderRequest(projectId, { ...payload, idempotencyKey: key });
    },
    onSuccess: () => { keyRef.current = null; setNotice("Purchase order sent to Super Admin for approval."); void refresh(); }
  });

  return <div className="purchase-orders__project-request">
    <div className="purchase-orders__request-heading"><div><p className="eyebrow">Project order preparation</p>
      <h3>Planned purchase order</h3><p>Review the budget and planned amount for {projectName}. GST defaults to 18% for every item.</p></div></div>
    {notice ? <p className="purchase-orders__notice" role="status">{notice}</p> : null}
    {preparation.isPending ? <PageState state="loading" message="Calculating procurement item totals…" />
      : preparation.isError ? <PageState state="error" message={procurementError(preparation.error, "Purchase order preparation could not be loaded.")} action={{ label: "Try again", onAction: () => void preparation.refetch() }} />
      : source ? <>
        <dl className="purchase-orders__totals" aria-label="Project purchase order amounts">
          <div><dt>Approved estimate, before GST</dt><dd>{formatPaise(source.approvedEstimatePaise)}</dd></div>
          <div><dt>Already committed, before GST</dt><dd>{formatPaise(source.committedPaise)}</dd></div>
          <div><dt>Remaining budget, before GST</dt><dd>{formatPaise(source.remainingPaise)}</dd></div>
          <div><dt>Planned amount, before GST</dt><dd>{netPaise === null ? "Incomplete" : formatPaise(netPaise)}</dd></div>
          <div><dt>GST (18%)</dt><dd>{gstPaise === null ? "Incomplete" : formatPaise(gstPaise)}</dd></div>
          <div><dt>Planned amount, with GST</dt><dd>{totalPaise === null ? "Incomplete" : formatPaise(totalPaise)}</dd></div>
        </dl>
        <p className="purchase-orders__hint">{items.length} item{items.length === 1 ? "" : "s"} in this order. The target date and location use project details; the scope uses each vendor's type. Vendor confirmation is required before work begins.</p>
        {blockers.length ? <div className="purchase-orders__request-blockers"><InlineMessage tone="warning">Resolve these issues before sending:</InlineMessage>
          <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
      </> : null}
    {requests.isPending ? <p className="purchase-orders__hint">Loading request history…</p>
      : requests.isError ? <div><InlineMessage tone="error">{procurementError(requests.error, "Request history could not be loaded. Refresh before sending.")}</InlineMessage><Button variant="secondary" onClick={() => void requests.refetch()}>Retry request history</Button></div>
      : latest ? <div className="purchase-orders__request-history">
        <div><span className={`purchase-orders__status purchase-orders__status--${latest.status}`}>{statusLabel[latest.status]}</span>
          <strong>{latest.requestNumber ?? "Project request"} · Revision {latest.revision}</strong>
          <small>{latest.status === "pending_approval" ? "Pending with Super Admin" : latest.status === "changes_requested" ? "Pending with Procurement" : latest.status === "approved" ? "Vendor orders released" : "Decision recorded"}</small></div>
        <dl className="purchase-orders__request-amounts"><div><dt>Before GST</dt><dd>{formatPaise(latest.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(latest.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(latest.totals.totalPaise)}</dd></div></dl>
        <details><summary>Sections, vendors and decision history</summary>
          <div className="purchase-orders__request-history-detail">
            {latest.sectionTotals.map((section) => <p key={section.sectionId}><span>{section.label}</span><strong>{formatPaise(section.totals.netPaise)} before GST · {formatPaise(section.totals.gstPaise)} GST · {formatPaise(section.totals.totalPaise)} total</strong></p>)}
            {latest.vendorTotals.map((vendor) => <p key={vendor.vendorId}><span>{vendor.name}</span><strong>{formatPaise(vendor.totals.netPaise)} before GST · {formatPaise(vendor.totals.gstPaise)} GST · {formatPaise(vendor.totals.totalPaise)} total</strong></p>)}
            {latest.decisions.map((decision) => <p key={decision.id}><span>{decision.decision.replaceAll("_", " ")} · {new Date(decision.decidedAt).toLocaleDateString()}</span><strong>{decision.reason ?? decision.budgetOverrideReason ?? ""}</strong></p>)}
          </div>
          {latest.revisions.length ? <div className="purchase-orders__revision-history"><h4>Submitted revisions</h4>
            {latest.revisions.map((revision) => <details key={revision.id}><summary>Revision {revision.revision} · {new Date(revision.submittedAt).toLocaleDateString()} · {formatPaise(revision.totals.totalPaise)} total</summary>
              <dl className="purchase-orders__request-amounts"><div><dt>Before GST</dt><dd>{formatPaise(revision.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(revision.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(revision.totals.totalPaise)}</dd></div></dl>
              <ul>{revision.lines.map((line) => <li key={line.id}>{line.sectionLabel} · {line.itemName} · {line.vendorName} · {formatPaise(line.totalPaise)}</li>)}</ul>
            </details>)}
          </div> : null}
        </details>
      </div> : null}
    {pending ? <InlineMessage tone="warning">This purchase order is waiting for Super Admin approval.</InlineMessage> : null}
    {correction?.decisions.length ? <InlineMessage tone="warning">{correction.decisions.at(-1)?.reason ?? "Super Admin requested changes to this order."}</InlineMessage> : null}
    {send.isError ? <InlineMessage tone="error">{procurementError(send.error, "The purchase order could not be sent. Refresh and retry.")}</InlineMessage> : null}
    {canManage && !pending ? <div className="purchase-orders__actions purchase-orders__send-action"><Button busy={send.isPending} disabled={!canSend || send.isSuccess} onClick={() => send.mutate()}>
      {correction ? "Resend purchase order to Super Admin" : "Send purchase order to Super Admin"}
    </Button></div> : null}
  </div>;
}
