import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeMainLine, listKnowledgeBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

export function CreateKnowledgeItemDialog({ onClose, onCreated, itemType = "main_line", initialBasketId = "", initialSubBasketName = "" }: {
  readonly itemType?: "main_line" | "temporary";
  readonly initialBasketId?: string;
  readonly initialSubBasketName?: string;
  readonly onClose: () => void;
  readonly onCreated: (mainLineId: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const temporary = itemType === "temporary";
  const [basketId, setBasketId] = useState(initialBasketId);
  const [subBasketName, setSubBasketName] = useState(initialSubBasketName);
  const [name, setName] = useState("");
  const baskets = useQuery({
    queryKey: [...knowledgeQueryKeys.basketLists(), "creation-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket")
  });
  const activeBaskets = baskets.data?.items.filter((basket) => basket.status === "active") ?? [];
  const valid = Boolean(!baskets.isError && activeBaskets.some((basket) => basket.id === basketId) && (temporary || subBasketName.trim()) && name.trim());
  const createItem = useMutation({
    mutationFn: () => createKnowledgeMainLine(basketId, { name: name.trim(), ...(subBasketName.trim() ? { subBasketName: subBasketName.trim() } : {}), ...(temporary ? { itemType: "temporary" } : {}) }),
    onSuccess: async (item) => {
      queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(basketId) }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(basketId) }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId) })
      ]);
      await onCreated(item.mainLineId);
    }
  });
  const busy = createItem.isPending;

  return (
    <Dialog title={temporary ? "Add temporary item" : "Add estimation item"} eyebrow="Estimation configuration" onClose={onClose} busy={busy}>
      <form className="knowledge-dialog-form" onSubmit={(event) => {
        event.preventDefault();
        if (!busy && valid) createItem.mutate();
      }}>
        <div className="knowledge-dialog-body">
          {temporary && <p>This item will be listed under its Main Basket with Overview, Mode and Quality Parameters.</p>}
          {createItem.error ? <InlineMessage tone="error" role="alert">{createItem.error.message}</InlineMessage> : null}
          {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
          {baskets.isError ? <InlineMessage tone="error" role="alert">Main Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button></InlineMessage> : null}
          {baskets.isSuccess && activeBaskets.length === 0 ? <InlineMessage tone="info">Create a Main Basket from Configuration before adding a Main Line.</InlineMessage> : null}
          <Field id="item-basket" label="Main basket" required>
            {(props) => <Select {...props} value={basketId} disabled={busy || !baskets.data || baskets.isError} onChange={(event) => { setBasketId(event.target.value); if (temporary) setSubBasketName(""); createItem.reset(); }}>
              <option value="">Select a basket</option>
              {activeBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
            </Select>}
          </Field>
          <Field id="item-sub-basket" label="Sub basket" required={!temporary}>
            {(props) => <Input {...props} maxLength={240} value={subBasketName} disabled={busy} onChange={(event) => { setSubBasketName(event.target.value); createItem.reset(); }} />}
          </Field>
          <Field id="item-name" label={temporary ? "Temporary item name" : "Main Line name"} required>
            {(props) => <Input {...props} maxLength={240} value={name} disabled={busy} onChange={(event) => { setName(event.target.value); createItem.reset(); }} />}
          </Field>
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy} disabled={busy || !valid}>{temporary ? "Add temporary item" : "Add estimation item"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
