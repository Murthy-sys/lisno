import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import {
  getBasketEnquiryHistory, getBasketEnquiryHistoryRevision, procurementBasketKeys
} from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";

const PAGE_SIZE = 20;
const sentAt = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function ProcurementBasketHistory({ projectId, basketId, enquiryId }: {
  projectId: string; basketId: string; enquiryId: string;
}) {
  const [open, setOpen] = useState(false);
  const [beforeRevision, setBeforeRevision] = useState<number | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<number | null>>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [bidOffset, setBidOffset] = useState(0);
  const [counterofferOffset, setCounterofferOffset] = useState(0);
  const history = useQuery({
    queryKey: procurementBasketKeys.history(projectId, basketId, enquiryId, beforeRevision),
    queryFn: ({ signal }) => getBasketEnquiryHistory(projectId, basketId, enquiryId, beforeRevision, signal),
    enabled: open
  });
  const revision = useQuery({
    queryKey: procurementBasketKeys.historyRevision(projectId, basketId, enquiryId, selectedRevisionId ?? "", bidOffset, counterofferOffset),
    queryFn: ({ signal }) => getBasketEnquiryHistoryRevision(projectId, basketId, enquiryId, selectedRevisionId!, bidOffset, counterofferOffset, signal),
    enabled: open && selectedRevisionId !== null
  });
  function selectRevision(id: string) {
    setSelectedRevisionId(id);
    setBidOffset(0);
    setCounterofferOffset(0);
  }
  return <details className="procurement-basket__history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Prior BOQ revisions</summary>
    {open ? <div className="procurement-basket__history-body">
      {history.isPending ? <PageState state="loading" message="Loading prior BOQ revisions…" /> : history.isError ? <PageState state="error" message={procurementError(history.error, "Prior BOQ revisions could not be loaded.")} action={{ label: "Try again", onAction: () => void history.refetch() }} /> : <>
        {!history.data.revisions.length ? <p className="procurement-basket__empty">No prior sent BOQ revision is available for this enquiry.</p> : <ul className="procurement-basket__history-list">{history.data.revisions.map((item) => <li key={item.id}><button type="button" aria-pressed={selectedRevisionId === item.id} onClick={() => selectRevision(item.id)}>View revision {item.revision}</button><span><time dateTime={item.sentAt}>{sentAt(item.sentAt)}</time> · {item.lineCount} BOQ lines · {item.bidCount} bids · {item.counterofferCount} counteroffers</span></li>)}</ul>}
        {history.data.nextBeforeRevision !== null || previousCursors.length ? <div className="procurement-basket__history-pages"><button type="button" disabled={!previousCursors.length} onClick={() => { const next = [...previousCursors]; setBeforeRevision(next.pop() ?? null); setPreviousCursors(next); setSelectedRevisionId(null); }}>Newer revisions</button><button type="button" disabled={history.data.nextBeforeRevision === null} onClick={() => { setPreviousCursors((current) => [...current, beforeRevision]); setBeforeRevision(history.data.nextBeforeRevision); setSelectedRevisionId(null); }}>Older revisions</button></div> : null}
      </>}
      {selectedRevisionId ? revision.isPending ? <PageState state="loading" message="Loading frozen BOQ and bids…" /> : revision.isError ? <PageState state="error" message={procurementError(revision.error, "This BOQ revision could not be loaded.")} action={{ label: "Try again", onAction: () => void revision.refetch() }} /> : <section className="procurement-basket__history-detail" aria-label={`BOQ revision ${revision.data.boq.revision}`}>
        <div className="procurement-basket__section-head"><div><p className="eyebrow">Historical, read only</p><h4>BOQ revision {revision.data.boq.revision}</h4><p>Sent <time dateTime={revision.data.boq.sentAt}>{sentAt(revision.data.boq.sentAt)}</time></p></div><span>{revision.data.boq.lines.length} lines</span></div>
        <div className="procurement-basket__table-wrap"><table><thead><tr><th scope="col">Frozen item</th><th scope="col">Quantity</th><th scope="col">Scope</th><th scope="col">Target date</th><th scope="col">Delivery</th></tr></thead><tbody>{revision.data.boq.lines.map((line) => <tr key={line.id}><th scope="row">{line.description}<small>{line.roomName}</small></th><td>{line.quantityMilliUnits / 1000} {line.uomCode}</td><td>{line.scopeType?.replaceAll("_", " ") ?? "Not specified"}</td><td>{line.targetDate ?? "Not specified"}</td><td>{line.deliveryLocation ?? "Not specified"}</td></tr>)}</tbody></table></div>
        <h5>Vendor bids · {revision.data.bidTotal}</h5>
        {!revision.data.bids.length ? <p>No bid on this page.</p> : <ul className="procurement-basket__history-bids">{revision.data.bids.map((bid) => <li key={bid.bidId}><details><summary>{bid.vendorName} · Bid {bid.revision} · {formatPaise(bid.totals.netPaise)} before GST</summary><p><time dateTime={bid.submittedAt}>{sentAt(bid.submittedAt)}</time> · GST {formatPaise(bid.totals.gstPaise)} · Gross {formatPaise(bid.totals.totalPaise)}</p><div className="procurement-basket__table-wrap"><table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Rate</th><th scope="col">Net</th></tr></thead><tbody>{bid.lines.map((line) => <tr key={line.boqLineId}><th scope="row">{line.description}</th><td>{line.quantityMilliUnits / 1000} {line.uomCode}</td><td>{formatPaise(line.unitPricePaise)}</td><td>{formatPaise(line.netPaise)}</td></tr>)}</tbody></table></div></details></li>)}</ul>}
        {revision.data.bidTotal > PAGE_SIZE ? <div className="procurement-basket__history-pages"><button type="button" disabled={bidOffset === 0} onClick={() => setBidOffset(Math.max(0, bidOffset - PAGE_SIZE))}>Previous bids</button><span>{bidOffset + 1}–{bidOffset + revision.data.bids.length} of {revision.data.bidTotal}</span><button type="button" disabled={bidOffset + revision.data.bids.length >= revision.data.bidTotal} onClick={() => setBidOffset(bidOffset + PAGE_SIZE)}>Next bids</button></div> : null}
        <h5>Counteroffers · {revision.data.counterofferTotal}</h5>
        {!revision.data.counteroffers.length ? <p>No counteroffer on this page.</p> : <ul className="procurement-basket__history-counteroffers">{revision.data.counteroffers.map((item) => <li key={item.id}><strong>{item.vendorName}</strong><span><time dateTime={item.requestedAt}>{sentAt(item.requestedAt)}</time> · {item.answeredBidId ? "Response received" : item.invitationStatus.replaceAll("_", " ")}{item.targetNetPaise === null ? "" : ` · Target ${formatPaise(item.targetNetPaise)} before GST`}</span><p>{item.reason}</p></li>)}</ul>}
        {revision.data.counterofferTotal > PAGE_SIZE ? <div className="procurement-basket__history-pages"><button type="button" disabled={counterofferOffset === 0} onClick={() => setCounterofferOffset(Math.max(0, counterofferOffset - PAGE_SIZE))}>Previous counteroffers</button><span>{counterofferOffset + 1}–{counterofferOffset + revision.data.counteroffers.length} of {revision.data.counterofferTotal}</span><button type="button" disabled={counterofferOffset + revision.data.counteroffers.length >= revision.data.counterofferTotal} onClick={() => setCounterofferOffset(counterofferOffset + PAGE_SIZE)}>Next counteroffers</button></div> : null}
      </section> : null}
    </div> : null}
  </details>;
}
