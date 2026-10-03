import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeSubBasket } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, StateView } from "../../ui/primitives";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";
import { allKnowledgePages, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeModal, KnowledgeText } from "./knowledgeUi";

type SubBasketTarget = {
  readonly kind: "sub-basket";
  readonly parent: KnowledgeBasket;
  readonly subBasket: KnowledgeSubBasket;
  readonly onSaved: (value: KnowledgeSubBasket) => void;
};
type MainLineTarget = {
  readonly kind: "main-line";
  readonly item: KnowledgeItemDetail;
  readonly onSaved: (value: KnowledgeItemDetail) => void;
};
type RenameTarget = SubBasketTarget | MainLineTarget;

function KnowledgeNameForm({ context, target, onClose }: { readonly context: KnowledgeMobileContext; readonly target: RenameTarget; readonly onClose: () => void }) {
  const originalName = target.kind === "sub-basket" ? target.subBasket.name : target.item.mainLineName;
  const originalVersion = target.kind === "sub-basket" ? target.subBasket.version : target.item.version;
  const [name, setName] = useState(originalName);
  const [conflict, setConflict] = useState(false);
  const [current, setCurrent] = useState<{ name: string; version: number } | null>(null);
  const eligible = context.ready && context.canRead && context.canUpdate && (target.kind === "sub-basket" ? target.parent.status !== "archived" : target.item.status !== "archived");
  const trimmed = name.trim();
  const valid = eligible && !conflict && trimmed.length > 0 && trimmed.length <= 240 && trimmed !== (current?.name ?? originalName);
  const loadCurrent = useMutation({
    mutationFn: async () => {
      if (target.kind === "sub-basket") {
        const records = await allKnowledgePages(page => context.api.listKnowledgeSubBaskets(target.parent.id, page));
        const record = records.find(value => value.id === target.subBasket.id && value.basketId === target.parent.id);
        if (!record) throw new Error("This Sub-Basket is no longer available under the selected Main Basket.");
        return { name: record.name, version: record.version };
      }
      const item = await context.api.getKnowledgeItem(target.item.mainLineId);
      if (item.mainLineId !== target.item.mainLineId) throw new Error("The selected Main Line could not be verified.");
      if (item.status === "archived") throw new Error("This archived item cannot be renamed.");
      return { name: item.mainLineName, version: item.version };
    },
    retry: false,
    onSuccess: value => setCurrent(value)
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Enter a different name before saving.");
      if (target.kind === "sub-basket") return context.api.updateKnowledgeSubBasket(target.parent.id, target.subBasket.id, {
        expectedVersion: current?.version ?? originalVersion, name: trimmed, managementContext: "configuration"
      });
      return context.api.updateKnowledgeMainLine(target.item.mainLineId, { expectedVersion: current?.version ?? originalVersion, name: trimmed });
    },
    retry: false,
    onSuccess: result => {
      if (target.kind === "sub-basket") target.onSaved(result as KnowledgeSubBasket);
      else target.onSaved(result as KnowledgeItemDetail);
    },
    onError: error => {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setConflict(true);
        setCurrent(null);
        loadCurrent.reset();
      }
    }
  });
  const busy = mutation.isPending || loadCurrent.isPending;
  return <KnowledgeModal title={target.kind === "sub-basket" ? "Edit Sub-Basket name" : "Edit Main Line name"} busy={busy} onClose={() => closeCatalogDraft(name !== originalName, onClose)}>
    <KnowledgeText>Main basket: {target.kind === "sub-basket" ? target.parent.name : target.item.basketName}</KnowledgeText>
    {target.kind === "main-line" && target.item.subBasketName ? <KnowledgeText>Sub-Basket: {target.item.subBasketName}</KnowledgeText> : null}
    <Field label="Name" value={name} onChangeText={setName} maxLength={240} editable={!busy} />
    {conflict ? <KnowledgeText error>This record changed elsewhere. Load its current name and version, review them, then save your retained name.</KnowledgeText> : mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    {conflict ? <Button label="Load current" variant="secondary" disabled={busy} loading={loadCurrent.isPending} onPress={() => loadCurrent.mutate()} /> : null}
    {loadCurrent.isError ? <KnowledgeText error>{catalogError(loadCurrent.error)}</KnowledgeText> : null}
    {current ? <><KnowledgeText>Current saved name: {current.name}</KnowledgeText><KnowledgeText>Current version: {current.version}</KnowledgeText></> : null}
    {conflict && current ? <Button label="Use current version" variant="secondary" onPress={() => { setConflict(false); mutation.reset(); }} /> : null}
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => closeCatalogDraft(name !== originalName, onClose)} />
    <Button label="Save name" disabled={!valid || busy} loading={mutation.isPending} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}

export function KnowledgeSubBasketRename({ context, parent, subBasket, onClose, onSaved }: {
  readonly context: KnowledgeMobileContext;
  readonly parent: KnowledgeBasket;
  readonly subBasket: KnowledgeSubBasket;
  readonly onClose: () => void;
  readonly onSaved: (value: KnowledgeSubBasket) => void;
}) {
  return <KnowledgeNameForm context={context} target={{ kind: "sub-basket", parent, subBasket, onSaved }} onClose={onClose} />;
}

export function KnowledgeMainLineRename({ context, mainLineId, onClose, onSaved }: {
  readonly context: KnowledgeMobileContext;
  readonly mainLineId: string;
  readonly onClose: () => void;
  readonly onSaved: (value: KnowledgeItemDetail) => void;
}) {
  const [snapshot, setSnapshot] = useState<KnowledgeItemDetail | null>(null);
  const detail = useQuery({
    queryKey: context.key("detail", mainLineId),
    queryFn: () => context.api.getKnowledgeItem(mainLineId),
    enabled: context.ready && context.canRead && context.canUpdate,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false
  });
  useEffect(() => {
    if (!snapshot && detail.isSuccess && !detail.isFetching && detail.data.mainLineId === mainLineId) setSnapshot(detail.data);
  }, [snapshot, detail.isSuccess, detail.isFetching, detail.data, mainLineId]);
  if (!context.ready || !context.canRead || !context.canUpdate) return <StateView title="Editing unavailable" message="Your current access does not allow this action." actionLabel="Close" onAction={onClose} />;
  if (!snapshot && (detail.isPending || detail.isFetching)) return <KnowledgeModal title="Edit Main Line name" onClose={onClose}><KnowledgeText>Loading current item…</KnowledgeText></KnowledgeModal>;
  if (!snapshot && (detail.isError || !detail.data || detail.data.mainLineId !== mainLineId)) return <KnowledgeModal title="Edit Main Line name" onClose={onClose}><StateView title="Item unavailable" message={detail.isError ? catalogError(detail.error) : "The selected item could not be verified."} actionLabel="Retry item" onAction={() => void detail.refetch()} /></KnowledgeModal>;
  if (!snapshot) return <KnowledgeModal title="Edit Main Line name" onClose={onClose}><KnowledgeText>Loading current item…</KnowledgeText></KnowledgeModal>;
  if (snapshot.status === "archived") return <KnowledgeModal title="Edit Main Line name" onClose={onClose}><KnowledgeText>This archived item cannot be renamed.</KnowledgeText></KnowledgeModal>;
  return <KnowledgeNameForm context={context} target={{ kind: "main-line", item: snapshot, onSaved }} onClose={onClose} />;
}
