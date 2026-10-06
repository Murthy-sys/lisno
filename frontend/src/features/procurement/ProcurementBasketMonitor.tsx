import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent } from "react";

import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import {
  createBasketShareIntent, getBasketPackageMonitor, getBasketWorkOrderPdf,
  procurementBasketKeys, type BasketEnquiry
} from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";

const TABS = ["Order", "Site performance", "Finance", "Vendor alerts"] as const;
type Tab = typeof TABS[number];

export function ProcurementBasketMonitor({ projectId, basketId, enquiry, readOnly = false }: {
  projectId: string; basketId: string; enquiry: BasketEnquiry; readOnly?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Order");
  const [share, setShare] = useState<{ available: boolean; shareUrl: string | null; blocker: string | null } | null>(null);
  const [notice, setNotice] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const awardId = enquiry.awardId;
  const monitor = useQuery({ queryKey: procurementBasketKeys.monitor(projectId, basketId, awardId ?? ""), queryFn: ({ signal }) => getBasketPackageMonitor(projectId, basketId, awardId!, signal), enabled: Boolean(awardId) });
  const pdf = useMutation({ mutationFn: async () => {
    if (!awardId) throw new Error("The issued award is unavailable.");
    const result = await getBasketWorkOrderPdf(projectId, basketId, awardId);
    const url = URL.createObjectURL(result.blob);
    try { const link = document.createElement("a"); link.href = url; link.download = result.filename ?? "work-order.pdf"; link.click(); }
    finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  }, onError: (cause) => setNotice(procurementError(cause, "The work order PDF could not be downloaded.")) });
  const shareIntent = useMutation({ mutationFn: () => createBasketShareIntent(projectId, basketId, awardId!),
    onSuccess: (result) => { setShare(result); setNotice(result.available ? "WhatsApp message is ready. Open it when you want to share the authenticated vendor order." : result.blocker ?? "WhatsApp sharing is unavailable for this vendor."); },
    onError: (cause) => setNotice(procurementError(cause, "The share link could not be prepared.")) });
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index - 1 + TABS.length) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setTab(TABS[next]); tabRefs.current[next]?.focus();
  }
  if (!awardId) return <PageState state="empty" message="The issued work order is not yet linked to this basket. Refresh after issuance is confirmed." />;
  if (monitor.isPending) return <PageState state="loading" message="Loading issued package…" />;
  if (monitor.isError) return <PageState state="error" message={procurementError(monitor.error, "The issued package could not be loaded.")} action={{ label: "Try again", onAction: () => void monitor.refetch() }} />;
  if (!monitor.data) return <PageState state="empty" message="The issued work order is not yet linked to this basket. Refresh after issuance is confirmed." />;
  const data = monitor.data;
  return <section className="procurement-basket__monitor" aria-labelledby="basket-monitor-title"><header className="procurement-basket__monitor-head"><div><p className="eyebrow">Issued package</p><h3 id="basket-monitor-title">{data.order.vendor.name} · {data.order.orderNumber}</h3><p>Order revision {data.order.revision} · {data.order.status.replaceAll("_", " ")}</p></div><strong>{formatPaise(data.order.totals.totalPaise)}</strong></header>
    <div className="procurement-basket__monitor-tabs" role="tablist" aria-label="Package monitor">{TABS.map((item, index) => <button key={item} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" id={`package-tab-${index}`} aria-controls={`package-panel-${index}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={(event) => handleTabKey(event, index)}>{item}</button>)}</div>
    <div role="tabpanel" id={`package-panel-${TABS.indexOf(tab)}`} aria-labelledby={`package-tab-${TABS.indexOf(tab)}`} tabIndex={0}>
      {tab === "Order" ? <div className="procurement-basket__monitor-panel"><div className="procurement-basket__table-wrap"><table><thead><tr><th scope="col">Awarded item</th><th scope="col">Quantity</th><th scope="col">Unit rate</th><th scope="col">GST</th><th scope="col">Total</th></tr></thead><tbody>{data.order.lines.map((line) => <tr key={line.id}><th scope="row">{line.description}{line.targetDate || line.deliveryLocation ? <small className="procurement-basket__order-line-meta">{[line.targetDate ? `Target ${line.targetDate}` : null, line.deliveryLocation ? `Delivery ${line.deliveryLocation}` : null].filter(Boolean).join(" · ")}</small> : null}</th><td>{line.quantityMilliUnits / 1000} {line.uomCode}</td><td>{formatPaise(line.unitPricePaise)}</td><td>{formatPaise(line.gstPaise)}</td><td>{formatPaise(line.totalPaise)}</td></tr>)}</tbody></table></div><dl className="procurement-basket__monitor-totals"><div><dt>Contract before GST</dt><dd>{formatPaise(data.order.totals.netPaise)}</dd></div><div><dt>Quoted GST</dt><dd>{formatPaise(data.order.totals.gstPaise)}</dd></div><div><dt>Total awarded</dt><dd>{formatPaise(data.order.totals.totalPaise)}</dd></div></dl>{data.order.terms ? <section className="procurement-basket__order-terms"><h4>Work order terms</h4><p>{data.order.terms}</p></section> : null}<div className="procurement-basket__monitor-actions"><button type="button" disabled={pdf.isPending} onClick={() => pdf.mutate()}>Download work order PDF</button>{!readOnly ? <><button type="button" disabled={shareIntent.isPending} onClick={() => shareIntent.mutate()}>Prepare WhatsApp work order</button>{share?.available && share.shareUrl ? <a href={share.shareUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp message</a> : null}</> : null}</div>{notice ? <p role={pdf.isError || shareIntent.isError ? "alert" : "status"} className={pdf.isError || shareIntent.isError ? "procurement-basket__error" : "procurement-basket__notice"}>{notice}</p> : null}</div> : null}
      {tab === "Site performance" ? <div className="procurement-basket__monitor-panel"><p>Site status: <strong>{data.site.status.replaceAll("_", " ")}</strong>{data.site.progressPercent === null ? " · Progress not recorded" : ` · ${data.site.progressPercent}% complete`}</p>{!data.site.tasks.length ? <p>No vendor work task is recorded for this order yet.</p> : <ul className="procurement-basket__monitor-list">{data.site.tasks.map((task) => <li key={task.id}><div><strong>{task.label}</strong><span>{task.status.replaceAll("_", " ")}{task.progressPercent === null ? "" : ` · ${task.progressPercent}%`}</span></div><small>{task.evidenceCount} evidence item{task.evidenceCount === 1 ? "" : "s"}{task.reviewOwnerName ? ` · Review: ${task.reviewOwnerName}` : ""}</small></li>)}</ul>}</div> : null}
      {tab === "Finance" ? <div className="procurement-basket__monitor-panel"><dl className="procurement-basket__monitor-totals"><div><dt>Contract before GST</dt><dd>{formatPaise(data.order.totals.netPaise)}</dd></div><div><dt>Quoted GST</dt><dd>{formatPaise(data.order.totals.gstPaise)}</dd></div><div><dt>Contract gross</dt><dd>{formatPaise(data.order.totals.totalPaise)}</dd></div><div><dt>Order-linked recorded cost</dt><dd>{data.finance.recordedCostPaise === null ? "Not recorded" : formatPaise(data.finance.recordedCostPaise)}</dd></div><div><dt>Paid</dt><dd>{data.finance.paidPaise === null ? "No linked payment record" : formatPaise(data.finance.paidPaise)}</dd></div></dl><h4>Contract payment schedule</h4><ol className="procurement-basket__monitor-list procurement-basket__monitor-schedule">{data.finance.paymentSchedule.map((milestone) => <li key={milestone.id}><strong>{milestone.name}</strong><span>{(milestone.basisPoints / 100).toFixed(2)}% · {formatPaise(milestone.amountPaise)}</span><div className="procurement-basket__reviewer-chips" role="group" aria-label={`${milestone.name} saved approvers`}>{milestone.reviewerSlots === undefined ? <span>Approver chips not recorded</span> : milestone.reviewerSlots.length ? milestone.reviewerSlots.map((slot) => <span key={slot} className="procurement-basket__reviewer-chip procurement-basket__reviewer-chip--selected">{slot === "program_manager" ? "PM" : slot === "designer" ? "Design" : slot === "procurement" ? "Proc" : "Fin"}</span>) : <span>No approver selected</span>}</div></li>)}</ol><h4>Invoice and withholding</h4><p>Vendor GST registration: {data.finance.gstRegistration.registered === null ? "Not confirmed" : data.finance.gstRegistration.registered ? "Registered" : "Not registered"}{data.finance.gstRegistration.gstin ? " · " + data.finance.gstRegistration.gstin : ""}</p>{data.finance.assessmentStatus === "pending" ? <p>Awaiting Finance review. Invoice amount, TDS and net payable are not yet verified.</p> : <dl className="procurement-basket__monitor-totals"><div><dt>Invoice total</dt><dd>{data.finance.invoiceTotalPaise === null ? "Not recorded" : formatPaise(data.finance.invoiceTotalPaise)}</dd></div><div><dt>TDS</dt><dd>{data.finance.tdsPaise === null ? "Not assessed" : formatPaise(data.finance.tdsPaise)}</dd></div><div><dt>Net payable</dt><dd>{data.finance.netPayablePaise === null ? "Not assessed" : formatPaise(data.finance.netPayablePaise)}</dd></div></dl>}</div> : null}
      {tab === "Vendor alerts" ? <div className="procurement-basket__monitor-panel">{!data.vendorAlerts.length ? <p>No active vendor alerts for this work order.</p> : <ul className="procurement-basket__monitor-list">{data.vendorAlerts.map((alert) => <li key={alert.id}><div><strong>{alert.message}</strong><span>{alert.ownerName ? `Owner: ${alert.ownerName}` : "Owner not assigned"}</span></div><small>{new Date(alert.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></li>)}</ul>}</div> : null}
    </div>
  </section>;
}
