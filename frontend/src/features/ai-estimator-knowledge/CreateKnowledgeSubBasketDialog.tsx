import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { ADD_MAIN_BASKET, CreateKnowledgeBasketFields } from "./CreateKnowledgeBasketFields";
import { CreateKnowledgeSubBasketFields } from "./CreateKnowledgeSubBasketFields";
import { listKnowledgeBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeSubBasket } from "./knowledgeTypes";

/** A whole Sub-Basket target is a catalog group, with no placeholder item. */
export function CreateKnowledgeSubBasketDialog({ initialBasketId, onBasketCreated, onSelected, onClose, onRefreshError }: {
  readonly initialBasketId: string;
  readonly onBasketCreated: (basket: KnowledgeBasket) => void;
  readonly onSelected: (group: KnowledgeSubBasket) => void;
  readonly onClose: () => void;
  readonly onRefreshError: (message: string) => void;
}) {
  const [basketId, setBasketId] = useState(initialBasketId);
  const [createdBasket, setCreatedBasket] = useState<KnowledgeBasket | null>(null);
  const [addingBasket, setAddingBasket] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedGroup, setSavedGroup] = useState<KnowledgeSubBasket | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const baskets = useQuery({
    queryKey: [...knowledgeQueryKeys.basketLists(), "creation-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket")
  });
  const options = baskets.data?.items.filter((basket) => basket.status === "active") ?? [];
  if (createdBasket && !options.some((basket) => basket.id === createdBasket.id)) options.push(createdBasket);

  function select(group: KnowledgeSubBasket) {
    setSavedGroup(group);
    try {
      onSelected(group);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "The Sub-Basket was saved, but could not be selected. Try again.");
    }
  }

  return <ContextPanel title="Add Sub-Basket" eyebrow="Estimation configuration" description="Create a Sub-Basket for this whole Sub-Basket rule. Its current and future eligible items will be covered after you save the rule." onClose={onClose} busy={busy} width="medium" className="knowledge-context-panel" dirty={Boolean(savedGroup || createdBasket || basketId !== initialBasketId)}
    footer={({ requestClose }) => <div className="knowledge-dialog-actions"><Button type="button" variant="destructive-outline" disabled={busy} onClick={requestClose}>{savedGroup ? "Close" : "Cancel"}</Button></div>}>
    <div className="knowledge-dialog-body">
      {savedGroup ? <InlineMessage tone={selectionError ? "warning" : "success"} role="status">Sub-Basket “{savedGroup.name}” is saved in Configuration. {selectionError || "Save this rule separately to keep the target."}{selectionError ? <Button type="button" variant="quiet" onClick={() => select(savedGroup)}>Select saved Sub-Basket</Button> : null}</InlineMessage> : null}
      {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
      {baskets.isError ? <InlineMessage tone="error" role="alert">Main Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button></InlineMessage> : null}
      <Field id="whole-sub-basket-parent" label="Main basket" required>
        {(props) => <Select {...props} value={basketId} disabled={busy || Boolean(savedGroup) || baskets.isPending || baskets.isError || addingBasket} onChange={(event) => {
          if (event.target.value === ADD_MAIN_BASKET) setAddingBasket(true);
          else setBasketId(event.target.value);
        }}><option value="">Select a Main Basket</option>{options.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}<option value={ADD_MAIN_BASKET}>Add Main Basket</option></Select>}
      </Field>
      {addingBasket ? <CreateKnowledgeBasketFields onBusyChange={setBusy} onCancel={() => setAddingBasket(false)} onCreated={(basket) => { setCreatedBasket(basket); onBasketCreated(basket); setBasketId(basket.id); setAddingBasket(false); }} onRefreshError={onRefreshError} /> : null}
      {basketId && options.some((basket) => basket.id === basketId) && !addingBasket && !savedGroup ? <CreateKnowledgeSubBasketFields key={basketId} basketId={basketId} onBusyChange={setBusy} onCancel={onClose} onCreated={(group) => select(group)} onRefreshError={onRefreshError} /> : null}
    </div>
  </ContextPanel>;
}
