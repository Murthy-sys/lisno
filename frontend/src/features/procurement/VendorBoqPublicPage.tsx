import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { inspectPublicVendorBoq, submitPublicVendorBoq, type VendorBoqInspection, type VendorBoqReceipt } from "./procurementBasketApi";
import { procurementRequestKey } from "./procurementPresentation";
import { consumeVendorBoqToken, releaseVendorBoqToken } from "./vendorBoqTokenVault";
import "./procurementBasket.css";

const CLAIMANT = Symbol("vendor-boq-public-page");
type Inspection = { state: "checking" } | { state: "unavailable" } | { state: "ready"; detail: VendorBoqInspection };

function toPaise(rupees: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(rupees.trim())) return null;
  const [whole, fraction = ""] = rupees.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
function toBasisPoints(percent: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/u.test(percent.trim())) return null;
  const [whole, fraction = ""] = percent.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return result <= 10_000 ? result : null;
}

export function VendorBoqPublicPage() {
  const claimed = useRef(false);
  const token = useRef<string | null>(null);
  if (!claimed.current) { claimed.current = true; token.current = consumeVendorBoqToken(CLAIMANT); }
  const inspectPromise = useRef<Promise<VendorBoqInspection> | null>(null);
  const command = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const [inspection, setInspection] = useState<Inspection>({ state: "checking" });
  const [rates, setRates] = useState<Record<string, { rupees: string; gstPercent: string }>>({});
  const [receipt, setReceipt] = useState<VendorBoqReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    releaseVendorBoqToken(CLAIMANT);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = robots?.content;
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = "noindex,nofollow,noarchive";
    return () => { if (previous === undefined) robots?.remove(); else if (robots) robots.content = previous; };
  }, []);

  useEffect(() => {
    if (!token.current) { setInspection({ state: "unavailable" }); return; }
    inspectPromise.current ??= inspectPublicVendorBoq(token.current);
    let active = true;
    void inspectPromise.current.then(
      (detail) => { if (active) setInspection({ state: "ready", detail }); },
      () => { if (active) { token.current = null; setInspection({ state: "unavailable" }); } }
    );
    return () => { active = false; };
  }, []);

  async function submit() {
    if (inspection.state !== "ready" || !token.current || busy) return;
    const lines: Array<{ boqLineId: string; unitPricePaise: number; gstBasisPoints: number }> = [];
    for (const line of inspection.detail.lines) {
      const values = rates[line.id];
      const unitPricePaise = toPaise(values?.rupees ?? "");
      const gstBasisPoints = toBasisPoints(values?.gstPercent ?? "");
      if (unitPricePaise === null || gstBasisPoints === null) {
        setError(`Enter a valid unit rate and GST percentage for ${line.description}.`);
        return;
      }
      lines.push({ boqLineId: line.id, unitPricePaise, gstBasisPoints });
    }
    const signature = JSON.stringify(lines);
    if (command.current?.signature !== signature) command.current = { signature, idempotencyKey: procurementRequestKey() };
    setBusy(true); setError("");
    try {
      const saved = await submitPublicVendorBoq({ token: token.current, idempotencyKey: command.current.idempotencyKey, lines });
      token.current = null; command.current = null; setReceipt(saved);
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403, 404, 409, 410].includes(cause.status)) {
        token.current = null; command.current = null; setInspection({ state: "unavailable" });
      } else setError(cause instanceof ApiError ? cause.message : "Your quote could not be confirmed. Check the amounts and retry.");
    } finally { setBusy(false); }
  }

  return <main className="vendor-boq" aria-labelledby="vendor-boq-title"><header className="vendor-boq__header"><p className="eyebrow">Lisno · Vendor enquiry</p><h1 id="vendor-boq-title">Submit your BOQ quotation</h1><p>Review the fixed items and quantities, then enter one unit rate and GST rate for each.</p></header>
    {receipt ? <section className="vendor-boq__receipt" role="status"><h2>Quotation submitted</h2><p>Your quotation was recorded. Procurement will contact you if a counteroffer is requested.</p><dl><div><dt>Before GST</dt><dd>{formatPaise(receipt.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(receipt.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(receipt.totals.totalPaise)}</dd></div></dl></section> : inspection.state === "checking" ? <PageState state="loading" message="Checking your BOQ link…" /> : inspection.state === "unavailable" ? <PageState state="error" message="This BOQ link is unavailable, expired or has already been used. Contact Procurement for a new invitation." /> : <>
      <section className="vendor-boq__identity"><div><span>Enquiry for</span><strong>{inspection.detail.projectName} / {inspection.detail.basketName}</strong></div><p>This link expires {new Date(inspection.detail.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p></section>
      <div className="vendor-boq__lines">{inspection.detail.lines.map((line, index) => <section className="vendor-boq__line" key={line.id} aria-labelledby={`vendor-boq-line-${index}`}><div>{line.scopeType || line.targetDate || line.deliveryLocation ? <p>{[line.scopeType?.replaceAll("_", " "), line.targetDate ? `Due ${line.targetDate}` : null, line.deliveryLocation].filter(Boolean).join(" · ")}</p> : null}<h2 id={`vendor-boq-line-${index}`}>{line.description}</h2><small>{line.quantityMilliUnits / 1000} {line.uomCode}</small><dl className="vendor-boq__approved-quote"><dt>Our quoted amount (before GST)</dt><dd>{line.approvedQuoteAmountPaise == null ? "Quoted amount unavailable" : formatPaise(line.approvedQuoteAmountPaise)}</dd><dd>For approved quantity {line.approvedQuantity} {line.approvedUnit ?? "(unit unavailable)"}</dd></dl></div><div className="vendor-boq__fields"><label>Unit rate · ₹<input type="text" inputMode="decimal" value={rates[line.id]?.rupees ?? ""} onChange={(event) => { setRates((current) => ({ ...current, [line.id]: { rupees: event.target.value, gstPercent: current[line.id]?.gstPercent ?? "" } })); setError(""); }} /></label><label>GST · %<input type="text" inputMode="decimal" value={rates[line.id]?.gstPercent ?? ""} onChange={(event) => { setRates((current) => ({ ...current, [line.id]: { rupees: current[line.id]?.rupees ?? "", gstPercent: event.target.value } })); setError(""); }} /></label></div></section>)}</div>
      {error ? <p role="alert" className="procurement-basket__error">{error}</p> : null}<div className="vendor-boq__submit"><p>All rates are reviewed and calculated by Lisno before they enter a vendor comparison.</p><button type="button" disabled={busy || !inspection.detail.lines.length} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit quotation"}</button></div>
    </>}
  </main>;
}
