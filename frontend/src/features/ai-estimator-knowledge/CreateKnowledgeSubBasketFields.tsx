import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeSubBasket, listKnowledgeSubBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { refreshKnowledgeSubBasketCatalog } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { requiresRelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeSubBasket } from "./knowledgeTypes";

export const ADD_SUB_BASKET = "add-sub-basket";

type Recovery = { kind: "idle" | "checking" | "unresolved" | "absent" }
  | { kind: "match"; group: KnowledgeSubBasket };

export function CreateKnowledgeSubBasketFields({ basketId, initialName = "", onCreated, onCancel, onBusyChange, onRefreshError }: {
  readonly basketId: string;
  readonly initialName?: string;
  readonly onCreated: (group: KnowledgeSubBasket, notice: string) => void;
  readonly onCancel: () => void;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onRefreshError?: (message: string, basketId: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [recovery, setRecovery] = useState<Recovery>({ kind: "idle" });
  const requestedName = useRef("");
  const submissionLocked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function reconcile(): Promise<KnowledgeSubBasket | null> {
    setRecovery({ kind: "checking" });
    try {
      const catalog = await collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(basketId, page), "Sub-Basket");
      queryClient.setQueryData([...knowledgeQueryKeys.subBasketLists(basketId), "creation-catalog"], catalog);
      const matches = catalog.items.filter((group) => group.basketId === basketId && normalizeName(group.name) === normalizeName(requestedName.current));
      if (matches.length > 1) throw new Error("The matching Sub-Basket identity is ambiguous.");
      const group = matches[0] ?? null;
      if (mounted.current) setRecovery(group ? { kind: "match", group } : { kind: "absent" });
      return group;
    } catch {
      if (mounted.current) setRecovery({ kind: "unresolved" });
      return null;
    }
  }

  const createGroup = useMutation({
    mutationFn: (groupName: string) => createKnowledgeSubBasket(basketId, { name: groupName }),
    onSuccess: async (group) => {
      if (mounted.current) onCreated(group, `Sub-Basket “${group.name}” was saved and selected.`);
      try {
        await refreshKnowledgeSubBasketCatalog(queryClient, basketId);
      } catch {
        onRefreshError?.("The Sub-Basket is saved, but some catalog lists could not refresh. Retry the catalog refresh before making further changes.", basketId);
      }
    },
    onError: async (error) => {
      if (requiresRelatedItemReconciliation(error)) await reconcile();
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = createGroup.isPending || recovery.kind === "checking";
  const locked = busy || recovery.kind === "unresolved";
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  function submit() {
    if (!name.trim() || locked || recovery.kind === "match" || submissionLocked.current) return;
    submissionLocked.current = true;
    requestedName.current = name.trim();
    setRecovery({ kind: "idle" });
    createGroup.mutate(requestedName.current);
  }

  async function useExisting() {
    if (recovery.kind !== "match" || submissionLocked.current) return;
    const previousId = recovery.group.id;
    submissionLocked.current = true;
    const group = await reconcile();
    submissionLocked.current = false;
    if (group?.id === previousId && mounted.current) onCreated(group, `Existing Sub-Basket “${group.name}” is selected.`);
  }

  return <div className="knowledge-dialog-form__inline-action" role="group" aria-label="Add Sub-Basket">
    {createGroup.error && recovery.kind === "idle" ? <InlineMessage tone="error" role="alert">{createGroup.error.message}</InlineMessage> : null}
    {recovery.kind === "checking" ? <p role="status">Checking the Sub-Basket catalog…</p> : null}
    {recovery.kind === "unresolved" ? <InlineMessage tone="error" role="alert">Could not confirm whether this Sub-Basket was added. Check the catalog before another attempt. <Button type="button" variant="quiet" onClick={() => void reconcile()}>Check Sub-Baskets again</Button></InlineMessage> : null}
    {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">No matching Sub-Basket was found. You can try adding it again.</InlineMessage> : null}
    {recovery.kind === "match" ? <InlineMessage tone="info" role="status">“{recovery.group.name}” already exists in this Main Basket. <Button type="button" variant="quiet" onClick={() => void useExisting()}>Use existing Sub-Basket</Button></InlineMessage> : null}
    <Field id={`${id}-name`} label="New Sub-Basket name" required error={createGroup.error instanceof ApiError ? createGroup.error.fields?.name : undefined}>
      {(props) => <Input {...props} autoFocus maxLength={240} value={name} disabled={locked}
        onChange={(event) => { setName(event.target.value); createGroup.reset(); setRecovery({ kind: "idle" }); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); submit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
        }} />}
    </Field>
    <div className="knowledge-dialog-actions">
      <Button type="button" variant="destructive-outline" disabled={busy} onClick={onCancel}>Cancel new Sub-Basket</Button>
      <Button type="button" busy={busy} disabled={!name.trim() || locked || recovery.kind === "match"} onClick={submit}>Save Sub-Basket</Button>
    </div>
  </div>;
}

function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
