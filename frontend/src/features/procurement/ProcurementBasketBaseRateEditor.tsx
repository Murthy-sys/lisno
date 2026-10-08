import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { purchaseOrderKeys } from "./purchaseOrderApi";
import { procurementBasketKeys, saveBasketBaseRate, type BasketEstimateSource, type ProcurementBasketLine } from "./procurementBasketApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";

const MAX_FINANCE_AMOUNT_PAISE = 9_000_000_000_000n;

function rateText(paise: number | null) {
  return paise === null ? "" : `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function parseRupees(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(trimmed)) return null;
  const [rupees = "0", fraction = ""] = trimmed.split(".");
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return paise <= MAX_FINANCE_AMOUNT_PAISE ? Number(paise) : null;
}

export function ProcurementBasketBaseRateEditor({ projectId, basketId, estimateSource, preparationDigest, line, frozen }: {
  projectId: string;
  basketId: string;
  estimateSource: BasketEstimateSource;
  preparationDigest: string;
  line: ProcurementBasketLine;
  frozen: boolean;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const errorId = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const rateInput = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(rateText(line.baseUnitRatePaise));
  const [error, setError] = useState("");
  const sourceSignature = JSON.stringify([estimateSource, preparationDigest, line.sourceLineItemKey,
    line.projectRate.version, line.projectRate.overridePaise, line.baseUnitRatePaise]);
  const previousSource = useRef(sourceSignature);

  useEffect(() => {
    if (previousSource.current === sourceSignature) return;
    previousSource.current = sourceSignature;
    setAmount(rateText(line.baseUnitRatePaise));
    if (editing) setError("The basket amount changed. Review the current value before saving.");
    attempt.current = null;
  }, [sourceSignature, line.baseUnitRatePaise, editing]);

  useEffect(() => {
    if (editing) rateInput.current?.focus();
    else if (restoreFocus.current && !frozen && editButton.current) {
      editButton.current.focus();
      restoreFocus.current = false;
    }
  }, [editing, frozen]);

  async function refreshBasket() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.detail(projectId, basketId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.enquiries(projectId, basketId) }),
      queryClient.invalidateQueries({ queryKey: ["procurement", "basket-comparison", projectId, basketId], refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: ["procurement", "basket-award", projectId, basketId], refetchType: "none" }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) })
    ]);
  }

  const save = useMutation({
    mutationFn: (baseRatePaise: number | null) => {
      const signature = JSON.stringify([estimateSource, preparationDigest, line.sourceLineItemKey,
        line.projectRate.version, baseRatePaise]);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: procurementRequestKey() };
      return saveBasketBaseRate(projectId, basketId, {
        sourceLineItemKey: line.sourceLineItemKey,
        baseRatePaise,
        expectedVersion: line.projectRate.version,
        expectedEstimateSource: estimateSource,
        expectedPreparationDigest: preparationDigest,
        idempotencyKey: attempt.current.key
      });
    },
    onSuccess: async () => {
      attempt.current = null;
      setEditing(false);
      setError("");
      restoreFocus.current = true;
      await refreshBasket();
    },
    onError: (cause) => {
      setError(procurementError(cause, "The base amount could not be saved."));
      if (cause instanceof ApiError && [409, 412].includes(cause.status)) {
        attempt.current = null;
        void refreshBasket();
      }
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const paise = parseRupees(amount);
    if (paise === null) {
      setError("Enter a nonnegative amount in rupees with no more than two decimal places.");
      return;
    }
    setError("");
    save.mutate(paise);
  }

  function close() {
    setEditing(false);
    setAmount(rateText(line.baseUnitRatePaise));
    setError("");
    attempt.current = null;
    restoreFocus.current = true;
  }

  return <div className="procurement-basket__base-rate">
    {!editing ? <>
      <span>{line.baseUnitRatePaise !== null ? formatPaise(line.baseUnitRatePaise) : "Unavailable"}</span>
      <button ref={editButton} type="button" className="procurement-basket__base-rate-link"
        aria-label={`Edit base amount for ${line.mainLineName}`} disabled={frozen}
        onClick={() => { setAmount(rateText(line.baseUnitRatePaise)); setError(""); setEditing(true); }}>Edit</button>
    </> : <form className="procurement-basket__base-rate-form" onSubmit={submit} aria-busy={save.isPending}>
      <label className="sr-only" htmlFor={inputId}>Base amount for {line.mainLineName} (₹/{line.approvedUnit})</label>
      <input ref={rateInput} id={inputId} type="text" inputMode="decimal" autoComplete="off" value={amount}
        aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        disabled={frozen || save.isPending}
        onChange={(event) => { setAmount(event.target.value); setError(""); attempt.current = null; }} />
      <div className="procurement-basket__base-rate-actions">
        <button type="submit" disabled={frozen || save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
        <button type="button" disabled={save.isPending} onClick={close}>Cancel</button>
      </div>
      {line.projectRate.overridePaise !== null ? <button type="button" className="procurement-basket__base-rate-link"
        disabled={frozen || save.isPending} onClick={() => { setError(""); save.mutate(null); }}
        aria-label={`Use Configuration price for ${line.mainLineName}`}>Use Configuration price</button> : null}
      {error ? <p id={errorId} role="alert" className="procurement-basket__base-rate-error">{error}</p> : null}
    </form>}
  </div>;
}
