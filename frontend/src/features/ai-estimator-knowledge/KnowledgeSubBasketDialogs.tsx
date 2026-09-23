import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import {
  createKnowledgeSubBasket, getKnowledgeSubBasketDeletionImpact, listKnowledgeSubBaskets,
  permanentlyDeleteKnowledgeSubBasket, updateKnowledgeSubBasket
} from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import {
  commitKnowledgeSubBasketMutation, refreshKnowledgeSubBasketCatalog, syncKnowledgeSubBasketDeletion
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { requiresRelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeBasket, KnowledgePermanentDeleteSubBasketResult, KnowledgeSubBasket } from "./knowledgeTypes";

type SubBasketCreationRecovery =
  | { readonly kind: "idle" | "checking" | "unresolved" | "absent" }
  | { readonly kind: "match"; readonly group: KnowledgeSubBasket };

export function KnowledgeSubBasketEditor({ basket, existing, fallbackFocusRef, onClose, onSaved }: {
  readonly basket: KnowledgeBasket;
  readonly existing?: KnowledgeSubBasket;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSaved: (subBasket: KnowledgeSubBasket) => void;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [version, setVersion] = useState(existing?.version ?? 1);
  const [saved, setSaved] = useState<KnowledgeSubBasket | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [conflictNotice, setConflictNotice] = useState("");
  const [recovery, setRecovery] = useState<SubBasketCreationRecovery>({ kind: "idle" });
  const requestedName = useRef("");
  const submissionLocked = useRef(false);

  async function reconcileCreation(): Promise<KnowledgeSubBasket | null> {
    setRecovery({ kind: "checking" });
    try {
      const catalog = await collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(basket.id, params), "Sub-Basket");
      const normalizeName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
      const matches = catalog.items.filter((group) => group.basketId === basket.id
        && normalizeName(group.name) === normalizeName(requestedName.current));
      if (matches.length > 1) throw new Error("The matching Sub-Basket identity is ambiguous.");
      const group = matches[0] ?? null;
      setRecovery(group ? { kind: "match", group } : { kind: "absent" });
      return group;
    } catch {
      setRecovery({ kind: "unresolved" });
      return null;
    }
  }

  async function useExistingSubBasket() {
    if (recovery.kind !== "match" || submissionLocked.current) return;
    const expectedId = recovery.group.id;
    submissionLocked.current = true;
    try {
      const group = await reconcileCreation();
      if (group?.id !== expectedId) return;
      setSaved(group);
      commitKnowledgeSubBasketMutation(queryClient, group);
      await refreshSaved(group);
    } finally { submissionLocked.current = false; }
  }

  async function refreshSaved(subBasket: KnowledgeSubBasket) {
    setRefreshing(true);
    setRefreshError("");
    try {
      await refreshKnowledgeSubBasketCatalog(queryClient, basket.id);
      onSaved(subBasket);
    } catch {
      setRefreshError("The Sub-Basket was saved, but the catalog could not refresh. Retry the refresh to see the latest list.");
    } finally { setRefreshing(false); }
  }

  async function loadCurrentVersion() {
    if (!existing) return;
    setRefreshing(true);
    try {
      const catalog = await collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(basket.id, params), "Sub-Basket");
      const current = catalog.items.find(({ id }) => id === existing.id);
      if (!current) throw new Error("This Sub-Basket is no longer available. Close the editor and refresh the catalog.");
      setVersion(current.version);
      setConflict(false);
      setConflictNotice(`Current saved name: “${current.name}”. Your entered name is unchanged. Review it before saving again.`);
      mutation.reset();
    } catch (error) {
      setConflictNotice(error instanceof Error ? error.message : "The current Sub-Basket could not be loaded.");
    } finally { setRefreshing(false); }
  }

  const mutation = useMutation({
    mutationFn: (submittedName: string) => existing
      ? updateKnowledgeSubBasket(basket.id, existing.id, { expectedVersion: version, name: submittedName, managementContext: "configuration" })
      : createKnowledgeSubBasket(basket.id, { name: submittedName }),
    onSuccess: async (subBasket) => {
      setSaved(subBasket);
      commitKnowledgeSubBasketMutation(queryClient, subBasket);
      await refreshSaved(subBasket);
    },
    onError: async (error) => {
      if (!existing && requiresRelatedItemReconciliation(error)) await reconcileCreation();
      else if (error instanceof ApiError && error.code === "VERSION_CONFLICT") setConflict(true);
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = mutation.isPending || refreshing || recovery.kind === "checking";
  const recoveryLocked = recovery.kind === "unresolved" || recovery.kind === "match";
  const canSave = Boolean(name.trim()) && !saved && !conflict && !busy && !recoveryLocked;

  return <ContextPanel
    title={existing ? "Edit Sub-Basket name" : "Add Sub-Basket"}
    eyebrow={basket.name}
    description="This catalog change saves immediately. A newly added Sub-Basket can remain empty until you add an item."
    onClose={onClose} busy={busy} width="medium" className="knowledge-context-panel"
    dirty={!saved && name !== (existing?.name ?? "")}
    initialFocusRef={inputRef} fallbackFocusRef={fallbackFocusRef}
    footer={({ requestClose }) => <div className="knowledge-dialog-actions">
      <Button variant={saved ? "quiet" : "destructive-outline"} onClick={requestClose}>{saved ? "Done" : "Cancel"}</Button>
      {saved ? <Button variant="secondary" busy={busy} onClick={() => void refreshSaved(saved)}>Retry catalog refresh</Button>
        : <Button type="submit" form={formId} busy={busy} disabled={!canSave}>{existing ? "Save name" : "Add Sub-Basket"}</Button>}
    </div>}
  >
    <form id={formId} className="knowledge-dialog-body" onSubmit={(event) => {
      event.preventDefault();
      if (!canSave || submissionLocked.current) return;
      submissionLocked.current = true;
      requestedName.current = name.trim();
      setRecovery({ kind: "idle" });
      mutation.mutate(requestedName.current);
    }}>
      {mutation.error && recovery.kind === "idle" ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
      {recovery.kind === "checking" ? <p role="status">Checking the Sub-Basket catalog…</p> : null}
      {recovery.kind === "unresolved" ? <InlineMessage tone="error" role="alert">
        Could not confirm whether this Sub-Basket was added. Check the catalog before another attempt.
        <Button variant="secondary" onClick={() => void reconcileCreation()}>Check Sub-Baskets again</Button>
      </InlineMessage> : null}
      {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">No matching Sub-Basket was found. You can try adding it again.</InlineMessage> : null}
      {recovery.kind === "match" && !saved ? <InlineMessage tone="info" role="status">
        “{recovery.group.name}” already exists in this Main Basket. Confirm this existing Sub-Basket to finish without another create.
        <Button variant="secondary" onClick={() => void useExistingSubBasket()}>Use existing Sub-Basket</Button>
      </InlineMessage> : null}
      {conflict ? <InlineMessage tone="warning" title="Sub-Basket changed">
        Load its current version before saving your entered name.
        <Button variant="secondary" busy={refreshing} onClick={() => void loadCurrentVersion()}>Load current Sub-Basket</Button>
      </InlineMessage> : null}
      {conflictNotice ? <InlineMessage tone="warning" role="status">{conflictNotice}</InlineMessage> : null}
      {refreshError ? <InlineMessage tone="warning" title="Sub-Basket saved" role="status">{refreshError}</InlineMessage> : null}
      <Field id={`${formId}-name`} label="Sub-Basket name" required>
        {(props) => <Input {...props} ref={inputRef} value={name} maxLength={240} disabled={busy || Boolean(saved) || recoveryLocked} onChange={(event) => {
          setName(event.target.value);
          if (!existing) { mutation.reset(); setRecovery({ kind: "idle" }); }
        }} />}
      </Field>
    </form>
  </ContextPanel>;
}

export function KnowledgeSubBasketDeleteDialog({ basket, subBasket, fallbackFocusRef, returnFocusRef, inline = false, disabledReason, onBusyChange, onCommitted, onRefreshError, onClose, onDeleted }: {
  readonly basket: KnowledgeBasket;
  readonly subBasket: KnowledgeSubBasket;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly inline?: boolean;
  readonly disabledReason?: string;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onCommitted?: (result: KnowledgePermanentDeleteSubBasketResult) => void;
  readonly onRefreshError?: (message: string) => void;
  readonly onClose: () => void;
  readonly onDeleted: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [confirmationName, setConfirmationName] = useState("");
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<KnowledgePermanentDeleteSubBasketResult | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const priorToken = useRef<string | undefined>(undefined);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submissionLocked = useRef(false);
  const committed = useRef(false);
  const impactQuery = useQuery({
    queryKey: knowledgeQueryKeys.subBasketDeletionImpact(basket.id, subBasket.id),
    queryFn: () => getKnowledgeSubBasketDeletionImpact(basket.id, subBasket.id),
    retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
    refetchOnReconnect: false, enabled: !saved
  });
  const impact = impactQuery.data;

  useEffect(() => {
    if (priorToken.current && priorToken.current !== impact?.impactToken) {
      setConfirmationName("");
      setConflict(true);
    }
    priorToken.current = impact?.impactToken;
  }, [impact?.impactToken]);

  async function refreshDeleted(result: KnowledgePermanentDeleteSubBasketResult) {
    setRefreshing(true);
    setRefreshError("");
    try {
      await syncKnowledgeSubBasketDeletion(queryClient, result);
      onDeleted(impact?.subBasketName ?? subBasket.name);
    } catch {
      const message = "The Sub-Basket was permanently deleted, but the catalog could not refresh. Retry the refresh; deletion will not run again.";
      setRefreshError(message);
      onRefreshError?.(message);
    } finally { setRefreshing(false); }
  }

  async function refreshImpact() {
    setConfirmationName("");
    await impactQuery.refetch();
  }

  const mutation = useMutation({
    retry: false,
    mutationFn: () => {
      if (!impact) throw new Error("Deletion impact is unavailable.");
      return permanentlyDeleteKnowledgeSubBasket(basket.id, subBasket.id, {
        expectedVersion: impact.version, confirmationName, reason: reason.trim(), impactToken: impact.impactToken,
        ...(inline ? { draftOnly: true as const } : {})
      });
    },
    onSuccess: async (result) => {
      setSaved(result);
      if (!committed.current) {
        committed.current = true;
        onCommitted?.(result);
      }
      await refreshDeleted(result);
    },
    onError: async (error) => {
      if (error instanceof ApiError && ["VERSION_CONFLICT", "DELETION_IMPACT_CHANGED"].includes(error.code)) {
        setConflict(true);
        await refreshImpact();
      }
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = mutation.isPending || refreshing;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const mutationBlock = inline && mutation.error instanceof ApiError
    && ["SUB_BASKET_FROZEN", "FORBIDDEN", "NOT_FOUND", "SUB_BASKET_PARENT_MISMATCH"].includes(mutation.error.code)
    ? mutation.error.code === "SUB_BASKET_FROZEN"
      ? "This Sub-Basket is frozen because at least one item has left Draft. Close this dialog and review it in Configuration."
      : mutation.error.code === "FORBIDDEN"
        ? "You no longer have permission to remove this Sub-Basket. Close this dialog and refresh your access."
        : "This Sub-Basket is no longer available under the reviewed Main Basket. Close this dialog and refresh the catalog."
    : undefined;
  const identityMatches = impact?.basketId === basket.id && impact?.subBasketId === subBasket.id;
  const blockReason = disabledReason || mutationBlock || (impact && !identityMatches ? "The deletion preview does not match this Sub-Basket. Close this dialog and refresh the catalog." : undefined);
  const canDelete = Boolean(impact && confirmationName === impact.subBasketName && reason.trim()
    && identityMatches && !blockReason && !busy && !impactQuery.isFetching && !impactQuery.isError && !saved);

  return <Dialog title={inline ? "Remove Sub-Basket?" : "Delete Sub-Basket?"} eyebrow={basket.name} role="alertdialog"
    description={`“${impact?.subBasketName ?? subBasket.name}” and its items will be permanently deleted. This cannot be undone.`}
    onClose={onClose} busy={busy} initialFocusRef={inline ? cancelRef : undefined} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
  >
    <form className={`knowledge-dialog-form${inline ? " knowledge-draft-catalog-dialog" : ""}`} onSubmit={(event) => {
      event.preventDefault();
      if (!canDelete || submissionLocked.current || committed.current) return;
      submissionLocked.current = true;
      mutation.mutate();
    }}>
      <div className="knowledge-dialog-body knowledge-basket-delete">
        {saved ? <InlineMessage tone="warning" title="Sub-Basket deleted" role="status">{refreshError || "Refreshing the catalog…"}</InlineMessage>
          : <>
            {inline ? <InlineMessage tone="warning" title="Removes this group from Configuration immediately">
              This rule will keep its unavailable target in your draft. Choose another target or remove the rule before saving the section.
            </InlineMessage> : null}
            {blockReason ? <InlineMessage tone="error" role="alert">{blockReason}</InlineMessage> : null}
            {impactQuery.isPending ? <PageState state="loading" message="Loading Sub-Basket deletion impact…" />
              : impactQuery.isError ? <PageState state="error" message={impactQuery.error.message} action={{ label: "Retry impact check", onAction: () => void refreshImpact() }} />
              : impact ? <div className="knowledge-basket-delete__impact">
                <dl>
                  <div><dt>Items deleted with it</dt><dd>{impact.mainLineCount}</dd></div>
                  <div><dt>References removed elsewhere</dt><dd>{impact.referenceCount}</dd></div>
                </dl>
                <InlineMessage tone="warning" title="This action cannot be undone">
                  {impact.mainLineCount ? "All items in this Sub-Basket, their revisions, sections and price versions will be deleted." : "This Sub-Basket is empty. Deleting it removes the group itself."}
                  {" "}References to this group and its items will be removed. Its Main Basket and sibling groups remain.
                </InlineMessage>
              </div> : null}
            {conflict ? <InlineMessage tone="warning" title="Deletion impact changed">
              {impactQuery.isError ? "The latest impact could not be loaded. Retry the impact check before continuing." : "Review the refreshed counts and enter the current Sub-Basket name again. Deletion was not retried."}
            </InlineMessage> : null}
            {mutation.error && !mutationBlock && !(mutation.error instanceof ApiError && ["VERSION_CONFLICT", "DELETION_IMPACT_CHANGED"].includes(mutation.error.code))
              ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : null}
            {impact ? <>
              <Field id={`${formId}-name`} label="Type Sub-Basket name to confirm" required hint={<>Enter <strong>{impact.subBasketName}</strong> exactly, including spaces and capitalization.</>}>
                {(props) => <Input {...props} value={confirmationName} autoComplete="off" maxLength={240} disabled={busy || impactQuery.isFetching} onChange={(event) => setConfirmationName(event.target.value)} />}
              </Field>
              <Field id={`${formId}-reason`} label="Reason" required hint="Recorded in the audit history for this permanent change.">
                {(props) => <Textarea {...props} value={reason} maxLength={1000} disabled={busy} onChange={(event) => setReason(event.target.value)} />}
              </Field>
            </> : null}
          </>}
      </div>
      <div className="knowledge-dialog-actions">
        <Button ref={cancelRef} variant={saved ? "quiet" : "destructive-outline"} onClick={onClose} disabled={busy}>{saved ? "Done" : "Cancel"}</Button>
        {saved ? <Button variant="secondary" busy={busy} onClick={() => void refreshDeleted(saved)}>Retry catalog refresh</Button>
          : <Button type="submit" variant="destructive" busy={busy} busyLabel={inline ? "Removing…" : "Deleting…"} disabled={!canDelete}>{inline ? "Remove permanently" : "Delete Sub-Basket"}</Button>}
      </div>
    </form>
  </Dialog>;
}
