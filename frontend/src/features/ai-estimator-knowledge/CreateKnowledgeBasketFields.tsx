import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeBasket, listKnowledgeBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { requiresRelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeBasket } from "./knowledgeTypes";

export const ADD_MAIN_BASKET = "add-main-basket";

export function CreateKnowledgeBasketFields({ onCreated, onCancel, onBusyChange, onRefreshError }: {
  onCreated: (basket: KnowledgeBasket, notice: string) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  onRefreshError?: (message: string, basketId: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [recovery, setRecovery] = useState<
    { kind: "idle" } | { kind: "checking" | "unresolved" | "absent"; requestedName: string }
  >({ kind: "idle" });
  const submissionLocked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function reconcile(requestedName: string) {
    setRecovery({ kind: "checking", requestedName });
    try {
      // Start a fresh read after the failed POST; a shared in-flight query
      // may have started before the basket was saved.
      const catalog = await collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket");
      queryClient.setQueryData([...knowledgeQueryKeys.basketLists(), "creation-catalog"], catalog);
      if (!mounted.current) return;
      const match = catalog.items.find((basket) => basket.status === "active" && normalizeName(basket.name) === normalizeName(requestedName));
      if (match) onCreated(match, `Main Basket “${match.name}” already exists and is selected.`);
      else {
        setRecovery({ kind: "absent", requestedName });
        createBasket.reset();
      }
    } catch {
      if (mounted.current) setRecovery({ kind: "unresolved", requestedName });
    }
  }

  const createBasket = useMutation({
    mutationFn: (requestedName: string) => createKnowledgeBasket({ name: requestedName }),
    onSuccess: async (basket) => {
      if (mounted.current) onCreated(basket, `Main Basket “${basket.name}” was added and selected.`);
      try {
        await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }, { throwOnError: true });
      } catch {
        onRefreshError?.("The Main Basket is saved, but the basket list could not refresh. Retry the catalog refresh before making further changes.", basket.id);
      }
    },
    // Re-read the catalog after a lost response before allowing another POST.
    onError: async (error, requestedName) => { if (requiresRelatedItemReconciliation(error)) await reconcile(requestedName); },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = createBasket.isPending || recovery.kind === "checking";
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const retryBlocked = recovery.kind === "checking" || recovery.kind === "unresolved";
  function submit() {
    const requestedName = name.trim();
    if (!requestedName || busy || retryBlocked || submissionLocked.current) return;
    submissionLocked.current = true;
    setRecovery({ kind: "idle" });
    createBasket.mutate(requestedName);
  }

  return <div className="knowledge-dialog-form__inline-action" role="group" aria-label="Add Main Basket">
    {createBasket.error && recovery.kind !== "unresolved" ? <InlineMessage tone="error" role="alert">{createBasket.error.message}</InlineMessage> : null}
    {recovery.kind === "unresolved" ? <InlineMessage tone="error" role="alert">
      Could not confirm whether this Main Basket was added. Check the basket list again before another attempt.{" "}
      <Button type="button" variant="quiet" onClick={() => void reconcile(recovery.requestedName)}>Check basket list again</Button>
    </InlineMessage> : null}
    {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">
      No matching Main Basket was found after checking the basket list. You can try adding it again.
    </InlineMessage> : null}
    <Field id={`${id}-name`} label="New Main Basket name" required error={createBasket.error instanceof ApiError ? createBasket.error.fields?.name : undefined}>
      {(props) => <Input {...props} autoFocus maxLength={240} value={name} disabled={busy || retryBlocked}
        onChange={(event) => { setName(event.target.value); createBasket.reset(); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); submit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
        }} />}
    </Field>
    <div className="knowledge-dialog-actions">
      <Button type="button" variant="destructive-outline" disabled={busy} onClick={onCancel}>Cancel new basket</Button>
      <Button type="button" busy={busy} disabled={!name.trim() || busy || retryBlocked} onClick={submit}>Save main basket</Button>
    </div>
  </div>;
}

function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
