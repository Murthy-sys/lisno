import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { ApiError } from "../../api/client";
import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { downloadEstimateTierComparison, getEstimateTierComparison, type EstimateTierComparison, type EstimateTierComparisonRequest } from "./estimateTierComparisonApi";
import "./estimate-sub-basket-modes.css";

export type EstimateSubBasketMode = "mode" | KnowledgeModeTier;
export interface EstimateSubBasketModeOption { tier: KnowledgeModeTier; available: boolean; reason?: string | null }
export interface EstimateSubBasketModesProps {
  label: string;
  value: EstimateSubBasketMode;
  options: readonly EstimateSubBasketModeOption[];
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (value: EstimateSubBasketMode) => void;
  comparison?: EstimateTierComparisonRequest;
  detailsDisabledReason?: string;
  comparisonOnly?: boolean;
  inline?: boolean;
}
const money = (paise: number | null) => paise === null ? "Incomplete" : new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2
}).format(paise / 100);
const message = (error: unknown) => error instanceof ApiError ? error.message : "Comparison unavailable. Please try again.";

/** Mode is local retained-choice state, never a new persisted pricing tier. */
export function EstimateSubBasketModes({ label, value, options, disabled = false, readOnly = false, onChange,
  comparison, detailsDisabledReason, comparisonOnly = false, inline = false }: EstimateSubBasketModesProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const requestKey = comparison ? JSON.stringify(comparison) : "";
  const stableComparison = useMemo(() => comparison, [requestKey]);
  const inlineComparison = comparisonOnly && inline;
  const Wrapper = inlineComparison ? "span" : "div";
  return <Wrapper className={`estimate-sub-basket-modes${inlineComparison ? " estimate-sub-basket-modes--inline" : ""}`}>
    {!comparisonOnly ? <><fieldset disabled={disabled || readOnly} aria-label={`Modes for ${label}`} aria-describedby={`${id}-help`}>
      <legend className="sr-only">Modes for {label}</legend>
      <label><input type="radio" name={id} value="mode" checked={value === "mode"} aria-label={`Mode for ${label}`} onChange={() => onChange("mode")} /><span>Mode</span></label>
      {options.map(option => <label key={option.tier} title={!option.available ? option.reason ?? "Unavailable for some included items." : undefined}>
        <input type="radio" name={id} value={option.tier} checked={value === option.tier} disabled={!option.available}
          aria-label={`${KNOWLEDGE_MODE_TIER_LABELS[option.tier]} tier for ${label}`} aria-describedby={!option.available ? `${id}-${option.tier}` : undefined}
          onChange={() => onChange(option.tier)} /><span>{KNOWLEDGE_MODE_TIER_LABELS[option.tier]}</span>
        {!option.available ? <span id={`${id}-${option.tier}`} className="sr-only">{option.reason ?? "Unavailable for some included items."}</span> : null}
      </label>)}
    </fieldset>
    <span id={`${id}-help`} className="estimate-sub-basket-modes__help">Mode keeps current line choices.</span></> : null}
    <button type="button" ref={trigger} className="button button--secondary" disabled={!comparison || Boolean(detailsDisabledReason)}
      title={detailsDisabledReason} aria-describedby={detailsDisabledReason ? `${id}-comparison-help` : undefined}
      aria-label={`Check tier comparison for ${label}`} onClick={() => setOpen(true)}>Check tier comparison</button>
    {detailsDisabledReason ? <span id={`${id}-comparison-help`} className="estimate-sub-basket-modes__help">{detailsDisabledReason}</span> : null}
    {open && stableComparison ? <TierComparisonDialog key={requestKey} request={stableComparison} label={label} returnFocusRef={trigger} onClose={() => setOpen(false)} /> : null}
  </Wrapper>;
}

function TierComparisonDialog({ request, label, returnFocusRef, onClose }: {
  request: EstimateTierComparisonRequest; label: string;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void;
}) {
  const [data, setData] = useState<EstimateTierComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    void getEstimateTierComparison(request, controller.signal).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => { controller.abort(); downloadRequest.current?.abort(); };
  }, [request, attempt]);
  const download = async () => {
    if (downloading || !data) return;
    const controller = new AbortController(); downloadRequest.current = controller;
    setDownloading(true); setDownloadError(null);
    try {
      const result = await downloadEstimateTierComparison(request, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a"); link.href = url; link.download = result.filename ?? "sub-basket-comparison.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) { if (!controller.signal.aborted) setDownloadError(message(cause)); }
    finally { if (!controller.signal.aborted) setDownloading(false); }
  };
  const lines = data?.tiers[0]?.lines ?? [];
  return <Dialog title={`Price comparison: ${label}`} eyebrow="Estimate options" className="estimate-tier-comparison"
    description="Compare configured selling prices for the included items and quantities. Sub-basket totals exclude GST."
    returnFocusRef={returnFocusRef} onClose={onClose}>
    <div className="estimate-tier-comparison__body">
      {error ? <div role="alert"><p>{error}</p><button type="button" className="button button--secondary" onClick={() => setAttempt(value => value + 1)}>Retry comparison</button></div>
        : !data ? <p role="status">Loading comparison…</p> : <>
          <p>{data.roomName} · {data.mainBasketName} · {data.subBasketName ?? "Direct items"}</p>
          <div className="estimate-tier-comparison__scroll" tabIndex={0} role="region" aria-label="Tier price comparison">
            <table><caption className="sr-only">Main-line prices and sub-basket totals for each mode</caption>
              <thead><tr><th scope="col">Main line</th>{data.tiers.map(tier => <th scope="col" key={tier.modeTier}>{tier.label}</th>)}</tr></thead>
              <tbody>{lines.map(line => <tr key={line.mainLineId}><th scope="row">{line.name}<small>{line.quantity} {line.uomName}</small></th>
                {data.tiers.map(tier => { const cell = tier.lines.find(entry => entry.mainLineId === line.mainLineId);
                  return <td key={tier.modeTier}>{cell && cell.amountPaise !== null ? <><strong>{money(cell.amountPaise)}</strong><small>{cell.ratePaise === null ? "Price including margin" : `${money(cell.ratePaise)} / ${cell.uomName}`}</small></>
                    : <span>{cell?.unavailableReason ?? "Price unavailable"}</span>}</td>;
                })}</tr>)}</tbody>
              <tfoot><tr><th scope="row">Sub-basket total</th>{data.tiers.map(tier => <td key={tier.modeTier}><strong>{money(tier.subtotalPaise)}</strong></td>)}</tr></tfoot>
            </table>
          </div>
          {data.tiers.some(tier => tier.subtotalPaise === null) ? <p>Incomplete totals require configured prices or component selections for every included item.</p> : null}
          <p>Viewing or downloading this comparison does not change the estimate.</p>
        </>}
      {downloadError ? <p role="alert">{downloadError}</p> : null}
    </div>
    <div className="estimate-tier-comparison__actions"><button type="button" className="button button--secondary" onClick={onClose}>Close</button>
      <button type="button" className="button" disabled={!data || downloading} onClick={() => void download()}>{downloading ? "Preparing PDF…" : "Download PDF"}</button></div>
  </Dialog>;
}
