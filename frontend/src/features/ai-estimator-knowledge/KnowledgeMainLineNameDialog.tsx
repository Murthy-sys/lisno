import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { getKnowledgeItem, updateKnowledgeMainLine } from "./knowledgeApi";
import { commitKnowledgeMainLineMutation, refreshKnowledgeMainLineCatalog } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

export function KnowledgeMainLineNameDialog({ item, mainLineId, listedName, onClose, onSaved, returnFocusRef }: {
  readonly item?: KnowledgeItemDetail;
  readonly mainLineId?: string;
  readonly listedName?: string;
  readonly onClose: () => void;
  readonly onSaved: (item: KnowledgeItemDetail) => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const selectedId = item?.mainLineId ?? mainLineId ?? "";
  const [loadedItem, setLoadedItem] = useState<KnowledgeItemDetail | null>(item ?? null);
  const detailQuery = useQuery({
    queryKey: knowledgeQueryKeys.item(selectedId),
    queryFn: () => getKnowledgeItem(selectedId),
    enabled: !item && Boolean(selectedId),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always"
  });
  useEffect(() => {
    if (!loadedItem && detailQuery.isSuccess && !detailQuery.isFetching && detailQuery.data?.mainLineId === selectedId) {
      setLoadedItem(detailQuery.data);
    }
  }, [detailQuery.data, detailQuery.isFetching, detailQuery.isSuccess, loadedItem, selectedId]);

  if (!loadedItem) return <Dialog
    title="Edit Main Line"
    eyebrow="Estimation configuration"
    description={`Loading current details for ${listedName ?? "the selected Main Line"}.`}
    onClose={onClose}
    returnFocusRef={returnFocusRef}
  >
    <div className="knowledge-dialog-body">
      {detailQuery.isError || detailQuery.data?.mainLineId !== undefined && detailQuery.data.mainLineId !== selectedId
        ? <PageState state="error" message={detailQuery.isError ? detailQuery.error.message : "The selected Main Line could not be verified."}
            action={{ label: "Retry Main Line", onAction: () => void detailQuery.refetch() }} />
        : <PageState state="loading" message="Loading current Main Line…" />}
    </div>
  </Dialog>;

  return <MainLineNameEditor item={loadedItem} onClose={onClose} onSaved={onSaved} returnFocusRef={returnFocusRef} />;
}

function MainLineNameEditor({ item, onClose, onSaved, returnFocusRef }: {
  readonly item: KnowledgeItemDetail;
  readonly onClose: () => void;
  readonly onSaved: (item: KnowledgeItemDetail) => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const queryClient = useQueryClient();
  const [currentItem, setCurrentItem] = useState(item);
  const [name, setName] = useState(item.mainLineName);
  const [saved, setSaved] = useState<KnowledgeItemDetail | null>(null);
  const [conflict, setConflict] = useState(false);
  const [conflictNotice, setConflictNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const submissionLocked = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function refreshSaved(updated: KnowledgeItemDetail) {
    setRefreshing(true);
    setRefreshError("");
    try {
      await refreshKnowledgeMainLineCatalog(queryClient);
      onSaved(updated);
    } catch {
      setRefreshError("The Main Line name was saved, but some catalog views could not refresh. Retry the refresh to load current names.");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadCurrentVersion() {
    setRefreshing(true);
    setConflictNotice("");
    try {
      const current = await getKnowledgeItem(item.mainLineId);
      if (current.mainLineId !== item.mainLineId) throw new Error("The selected Main Line could not be verified.");
      queryClient.setQueryData(knowledgeQueryKeys.item(current.mainLineId), current);
      setCurrentItem(current);
      setConflict(false);
      setConflictNotice(`Current saved name: “${current.mainLineName}”. Your entered name is unchanged. Review it before saving again.`);
      mutation.reset();
    } catch (error) {
      setConflictNotice(error instanceof Error ? error.message : "The current Main Line could not be loaded.");
    } finally {
      setRefreshing(false);
    }
  }

  const mutation = useMutation({
    mutationFn: ({ expectedVersion, submittedName }: { expectedVersion: number; submittedName: string }) =>
      updateKnowledgeMainLine(item.mainLineId, { expectedVersion, name: submittedName }),
    onSuccess: (updated) => {
      setSaved(updated);
      commitKnowledgeMainLineMutation(queryClient, updated);
      void refreshSaved(updated);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") setConflict(true);
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = mutation.isPending || refreshing;
  const trimmedName = name.trim();
  const canSave = Boolean(trimmedName) && trimmedName.length <= 240
    && trimmedName !== currentItem.mainLineName
    && currentItem.status !== "archived" && !saved && !conflict && !busy;

  return <Dialog
    title="Edit Main Line"
    eyebrow="Estimation configuration"
    description={`Main Basket: ${currentItem.basketName}${currentItem.subBasketName ? ` · Sub-Basket: ${currentItem.subBasketName}` : ""}`}
    onClose={onClose}
    busy={busy}
    initialFocusRef={nameRef}
    returnFocusRef={returnFocusRef}
  >
    <form className="knowledge-dialog-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSave || submissionLocked.current) return;
      submissionLocked.current = true;
      mutation.mutate({ expectedVersion: currentItem.version, submittedName: trimmedName });
    }}>
      <div className="knowledge-dialog-body">
        {mutation.error && !conflict ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
        {conflict ? <InlineMessage tone="warning" title="Main Line changed" role="alert">
          Load its current name and version before saving your entered name.
          <Button variant="secondary" busy={refreshing} onClick={() => void loadCurrentVersion()}>Load current Main Line</Button>
        </InlineMessage> : null}
        {conflictNotice ? <InlineMessage tone="warning" role="status">{conflictNotice}</InlineMessage> : null}
        {currentItem.status === "archived" ? <InlineMessage tone="warning" role="status">This Main Line is archived and cannot be renamed.</InlineMessage> : null}
        {refreshError ? <InlineMessage tone="warning" title="Main Line saved" role="status">{refreshError}</InlineMessage> : null}
        <Field id="main-line-name" label="Main Line name" required>
          {(props) => <Input {...props} ref={nameRef} value={name} maxLength={240} disabled={busy || Boolean(saved) || currentItem.status === "archived"} onChange={(event) => {
            setName(event.target.value);
            if (!conflict) mutation.reset();
          }} />}
        </Field>
      </div>
      <div className="knowledge-dialog-actions">
        <Button type="button" variant={saved ? "quiet" : "destructive-outline"} onClick={onClose} disabled={busy}>{saved ? "Done" : "Cancel"}</Button>
        {saved ? <Button type="button" variant="secondary" busy={busy} onClick={() => void refreshSaved(saved)}>Retry catalog refresh</Button>
          : <Button type="submit" busy={busy} disabled={!canSave}>Save Main Line</Button>}
      </div>
    </form>
  </Dialog>;
}
