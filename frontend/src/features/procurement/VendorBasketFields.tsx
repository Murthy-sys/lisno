import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { CreateKnowledgeBasketFields } from "../ai-estimator-knowledge/CreateKnowledgeBasketFields";
import { CreateKnowledgeSubBasketFields } from "../ai-estimator-knowledge/CreateKnowledgeSubBasketFields";
import { listKnowledgeBaskets, listKnowledgeSubBaskets } from "../ai-estimator-knowledge/knowledgeApi";
import { collectAllKnowledgeMasterPages } from "../ai-estimator-knowledge/knowledgeMasterPagination";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeSubBasket, ProcurementVendorSummary } from "../ai-estimator-knowledge/knowledgeTypes";

export function VendorBasketFields({ mainBasketId, subBasketId, original, errors, canCreate, disabled, onChange, onBusyChange, onDraftChange }: {
  mainBasketId: string; subBasketId: string; original?: ProcurementVendorSummary; errors: Record<string, string>;
  canCreate: boolean; disabled: boolean; onChange: (main: string, sub: string) => void; onBusyChange: (busy: boolean) => void; onDraftChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const [adding, setAdding] = useState<"main" | "sub" | null>(null);
  useEffect(() => { onDraftChange(Boolean(adding)); return () => onDraftChange(false); }, [adding, onDraftChange]);
  const [addedMain, setAddedMain] = useState<KnowledgeBasket | null>(null);
  const [addedSub, setAddedSub] = useState<KnowledgeSubBasket | null>(null);
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const baskets = useQuery({ queryKey: [...knowledgeQueryKeys.basketLists(), "vendor-active-catalog"], queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket") });
  const subs = useQuery({ queryKey: [...knowledgeQueryKeys.subBasketLists(mainBasketId), "vendor-catalog"], queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(mainBasketId, page), "Sub Basket"), enabled: Boolean(mainBasketId) });
  const mainOptions = [...(baskets.data?.items ?? [])];
  if (addedMain && !mainOptions.some((option) => option.id === addedMain.id)) mainOptions.push(addedMain);
  const subOptions = (subs.data?.items ?? []).filter((option) => option.basketId === mainBasketId);
  if (addedSub?.basketId === mainBasketId && !subOptions.some((option) => option.id === addedSub.id)) subOptions.push(addedSub);
  const mainUnavailable = mainBasketId && !mainOptions.some((option) => option.id === mainBasketId);
  const subUnavailable = subBasketId && !subOptions.some((option) => option.id === subBasketId);
  return <>
    <div className="vendor-profile__basket-rows"><div className="vendor-profile__basket-row">
      <Field id={`${id}-main`} label="Main Basket" required error={errors.mainBasketId} hint="Shared with Configuration.">
        {(props) => <Select {...props} value={mainBasketId} disabled={disabled || adding !== null || baskets.isPending || baskets.isError} onChange={(event) => { onChange(event.target.value, ""); setAddedSub(null); setNotice(""); }}>
          <option value="">Select Main Basket</option>
          {mainUnavailable ? <option value={mainBasketId}>{original?.mainBasket?.name ?? mainBasketId} (unavailable for new selections)</option> : null}
          {mainOptions.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
        </Select>}
      </Field>
      {canCreate && !adding ? <Button variant="secondary" size="compact" disabled={disabled} onClick={() => setAdding("main")} leadingIcon={<Plus aria-hidden="true" />}>Add Main Basket</Button> : null}
    </div><div className="vendor-profile__basket-row">
      <Field id={`${id}-sub`} label="Sub Basket" required error={errors.subBasketId}>
        {(props) => <Select {...props} value={subBasketId} disabled={disabled || adding !== null || !mainBasketId || subs.isPending || subs.isError} onChange={(event) => onChange(mainBasketId, event.target.value)}>
          <option value="">{mainBasketId ? "Select Sub Basket" : "Select Main Basket first"}</option>
          {subUnavailable ? <option value={subBasketId}>{original?.subBasket?.name ?? subBasketId} (unavailable for new selections)</option> : null}
          {subOptions.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
        </Select>}
      </Field>
      {canCreate && !adding ? <Button variant="secondary" size="compact" disabled={disabled || !mainBasketId || Boolean(mainUnavailable)} onClick={() => setAdding("sub")} leadingIcon={<Plus aria-hidden="true" />}>Add Sub Basket</Button> : null}
    </div></div>
    {baskets.isPending || (mainBasketId && subs.isPending) ? <p role="status">Loading shared baskets…</p> : null}
    {baskets.isError || (mainBasketId && subs.isError) || refreshError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={async () => { const results = await Promise.all([baskets.refetch(), ...(mainBasketId ? [subs.refetch()] : [])]); if (results.every((result) => !result.isError)) setRefreshError(""); }}>Retry baskets</Button>}>{refreshError || "The shared basket list could not be loaded. Your vendor entries are preserved."}</InlineMessage> : null}
    {!baskets.isPending && !baskets.isError && !mainOptions.length ? <p>No active Main Baskets are available.</p> : null}
    {mainBasketId && !subs.isPending && !subs.isError && !subOptions.length ? <p>No Sub Baskets are available in this Main Basket.</p> : null}
    {adding === "main" ? <CreateKnowledgeBasketFields onBusyChange={onBusyChange} onCancel={() => setAdding(null)} onRefreshError={(message) => setRefreshError(message)} onCreated={(basket, message) => { setAddedMain(basket); setAddedSub(null); onChange(basket.id, ""); setAdding(null); setNotice(message); }} /> : null}
    {adding === "sub" ? <CreateKnowledgeSubBasketFields key={mainBasketId} basketId={mainBasketId} onBusyChange={onBusyChange} onCancel={() => setAdding(null)} onRefreshError={(message) => setRefreshError(message)} onCreated={(sub, message) => { setAddedSub(sub); onChange(mainBasketId, sub.id); setAdding(null); setNotice(message); }} /> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </>;
}
