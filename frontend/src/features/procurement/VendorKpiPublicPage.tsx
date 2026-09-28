import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import type { VendorKpiPublicInspection, VendorKpiSubmissionReceipt, VendorKpiPublicSubmitInput } from "../../../../shared/knowledge/vendorKpi";
import { inspectPublicVendorKpi, submitPublicVendorKpi } from "./vendorKpiApi";
import { VendorKpiScoreForm } from "./VendorKpiScoreForm";
import { formatVendorKpiScore } from "./vendorKpiPresentation";
import { procurementRequestKey } from "./procurementPresentation";
import { consumeVendorKpiToken, releaseVendorKpiToken } from "./vendorKpiTokenVault";
import "./vendorKpi.css";

const CLAIMANT = Symbol("vendor-kpi-public-page");
type Inspection = { state: "checking" } | { state: "unavailable" } | { state: "ready"; detail: VendorKpiPublicInspection };
const unavailableError = (error: unknown) => error instanceof ApiError && [400, 401, 403, 404, 409, 410].includes(error.status);

export function VendorKpiPublicPage() {
  const claimed = useRef(false);
  const token = useRef<string | null>(null);
  if (!claimed.current) { claimed.current = true; token.current = consumeVendorKpiToken(CLAIMANT); }
  const inspectPromise = useRef<Promise<VendorKpiPublicInspection> | null>(null);
  const command = useRef<VendorKpiPublicSubmitInput | null>(null);
  const [inspection, setInspection] = useState<Inspection>({ state: "checking" });
  const [receipt, setReceipt] = useState<VendorKpiSubmissionReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    releaseVendorKpiToken(CLAIMANT);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = robots?.content;
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = "noindex,nofollow,noarchive";
    return () => { if (previous === undefined) robots?.remove(); else if (robots) robots.content = previous; };
  }, []);

  useEffect(() => {
    if (!token.current) { setInspection({ state: "unavailable" }); return; }
    inspectPromise.current ??= inspectPublicVendorKpi(token.current);
    let active = true;
    void inspectPromise.current.then(
      (detail) => { if (active) setInspection({ state: "ready", detail }); },
      () => { if (active) { token.current = null; setInspection({ state: "unavailable" }); } }
    );
    return () => { active = false; };
  }, []);

  async function save(values: { scores: VendorKpiPublicSubmitInput["scores"]; comment: string | null }) {
    if (inspection.state !== "ready" || !token.current || busy) return;
    if (!command.current || JSON.stringify(command.current.scores) !== JSON.stringify(values.scores) || command.current.comment !== values.comment) {
      command.current = { token: token.current, rubricVersion: inspection.detail.rubricVersion, idempotencyKey: procurementRequestKey(), ...values };
    }
    setBusy(true); setError("");
    try {
      const saved = await submitPublicVendorKpi(command.current);
      token.current = null; command.current = null;
      setReceipt(saved);
    } catch (cause) {
      if (unavailableError(cause)) {
        token.current = null; command.current = null;
        setInspection({ state: "unavailable" });
      } else {
        setError("Your response could not be confirmed. Retry to check or complete this submission.");
      }
    } finally { setBusy(false); }
  }

  return <main className="vendor-kpi vendor-kpi--public" aria-labelledby="vendor-kpi-public-title">
    <header className="vendor-kpi__public-header"><p className="vendor-kpi__eyebrow">Lisno · Vendor performance</p><h1 id="vendor-kpi-public-title">Vendor self assessment</h1><p>Rate your work on each category. Your ratings are reviewed separately from Procurement’s assessment.</p></header>
    {receipt ? <section className="vendor-kpi__receipt" role="status"><h2>Assessment saved</h2><p>Your self rating is {formatVendorKpiScore(receipt.averageScoreBps)}. Procurement can now view your response.</p><p>Saved {new Date(receipt.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p></section> : inspection.state === "checking" ? <PageState state="loading" message="Checking your assessment link…" /> : inspection.state === "unavailable" ? <PageState state="error" message="This assessment link is unavailable or has already been used. Contact your Procurement representative for a new request." /> : <>
      <section className="vendor-kpi__public-identity" aria-label="Vendor details"><div><span>Vendor</span><strong>{inspection.detail.vendor.name}</strong><small>{inspection.detail.vendor.code} · {inspection.detail.vendor.vendorType === "execution" ? "Execution vendor" : "Supplier"}</small></div><dl><div><dt>Work profile</dt><dd>{inspection.detail.vendor.workProfile || "Not recorded"}</dd></div><div><dt>Main baskets</dt><dd>{inspection.detail.vendor.mainBasketNames.join(", ") || "Not recorded"}</dd></div><div><dt>Sub baskets</dt><dd>{inspection.detail.vendor.subBasketNames.join(", ") || "Not recorded"}</dd></div></dl></section>
      <p className="vendor-kpi__meta">This link expires {new Date(inspection.detail.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} and can be used once.</p>
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      <VendorKpiScoreForm title="Your self rating" type={inspection.detail.vendor.vendorType} busy={busy} submitLabel="Save Vendor KPI" onSave={save} />
    </>}
  </main>;
}
