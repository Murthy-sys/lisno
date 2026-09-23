import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { listKnowledgeBaskets, listKnowledgeSubBaskets } from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KnowledgeSubBasketEditor, KnowledgeSubBasketDeleteDialog } from "./KnowledgeSubBasketDialogs";
import type { KnowledgeBasket, KnowledgeSubBasket } from "./knowledgeTypes";

const PAGE_SIZE = 100;

export function KnowledgeBasketManagementDialog({
  canCreate, canUpdate, canLifecycle, onCreate, onClose, onEdit, onDelete, childDialogOpen
}: {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canLifecycle: boolean;
  readonly onCreate: () => void;
  readonly onClose: () => void;
  readonly onEdit: (basket: KnowledgeBasket) => void;
  readonly onDelete: (basket: KnowledgeBasket) => void;
  readonly childDialogOpen: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [subOffset, setSubOffset] = useState(0);
  const [selectedBasket, setSelectedBasket] = useState<KnowledgeBasket | null>(null);
  const [editor, setEditor] = useState<KnowledgeSubBasket | "new" | null>(null);
  const [deletion, setDeletion] = useState<KnowledgeSubBasket | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusAfterNavigation = useRef(false);
  const params = { includeArchived: true, limit: PAGE_SIZE, offset } as const;
  const basketsQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketList(params),
    queryFn: () => listKnowledgeBaskets(params),
    retry: false
  });
  const basket = basketsQuery.data?.items.find(({ id }) => id === selectedBasket?.id) ?? selectedBasket;
  const subParams = { limit: PAGE_SIZE, offset: subOffset };
  const subBasketsQuery = useQuery({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basket?.id ?? ""), subParams],
    queryFn: () => listKnowledgeSubBaskets(basket!.id, subParams),
    enabled: Boolean(basket),
    retry: false
  });
  const activeQuery = basket ? subBasketsQuery : basketsQuery;

  useEffect(() => {
    if (activeQuery.isFetching || !focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    resultsRef.current?.focus();
  }, [activeQuery.isFetching, basket?.id, offset, subOffset]);

  function navigatePage(nextOffset: number) {
    focusAfterNavigation.current = true;
    if (basket) setSubOffset(Math.max(0, nextOffset));
    else setOffset(Math.max(0, nextOffset));
  }

  const currentOffset = basket ? subOffset : offset;
  const data = activeQuery.data;

  return <>
    <ContextPanel
      title="Manage baskets"
      eyebrow="Estimation configuration"
      description="Manage Main Baskets and their Sub-Baskets. Permanent deletion also removes the selected basket’s contents."
      onClose={onClose}
      contentInert={childDialogOpen || Boolean(editor || deletion)}
      width="wide"
      className="knowledge-context-panel"
      footer={<div className="knowledge-dialog-actions"><Button variant="secondary" onClick={onClose}>Done</Button></div>}
    >
      <div className="knowledge-dialog-body knowledge-basket-manager">
        <div className="knowledge-basket-manager__toolbar">
          {basket ? <>
            <Button variant="quiet" onClick={() => {
              focusAfterNavigation.current = true;
              setSelectedBasket(null);
              setAnnouncement("");
            }}>Back to Main Baskets</Button>
            <h3>Sub-Baskets in {basket.name}</h3>
            {canCreate && basket.status === "active" ? <Button variant="secondary" onClick={() => setEditor("new")}>Add Sub-Basket</Button> : null}
          </> : <>
            <h3>Main Baskets</h3>
            {canCreate ? <Button variant="secondary" onClick={onCreate}>Add main basket</Button> : null}
          </>}
        </div>
        {basket && basket.status !== "active" ? <InlineMessage tone="warning">
          {basket.status === "archived"
            ? "This Main Basket is archived. Its Sub-Baskets are read-only."
            : "This Main Basket is inactive. Activate it before adding a Sub-Basket."}
        </InlineMessage> : null}
        {announcement ? <p role="status">{announcement}</p> : null}
        <div ref={resultsRef} className="knowledge-basket-manager__results" tabIndex={-1} aria-busy={activeQuery.isFetching || undefined}>
          {activeQuery.isPending ? <PageState state="loading" message={basket ? "Loading Sub-Baskets…" : "Loading main baskets…"} />
            : activeQuery.isError ? <PageState state="error" message={activeQuery.error.message} action={{ label: "Try again", onAction: () => void activeQuery.refetch() }} />
            : data ? <>
              {data.items.length === 0 ? <PageState state="empty" message={basket
                ? currentOffset ? "No Sub-Baskets are available on this page." : "No Sub-Baskets have been added to this Main Basket."
                : currentOffset ? "No main baskets are available on this page." : "No main baskets have been added yet."} />
                : basket ? <ul className="knowledge-basket-manager__list" aria-label={`Sub-Baskets in ${basket.name}`}>
                  {subBasketsQuery.data?.items.map((subBasket) => <li key={subBasket.id} className="knowledge-basket-manager__row">
                    <div className="knowledge-basket-manager__summary"><h4>{subBasket.name}</h4></div>
                    <div className="knowledge-basket-manager__actions">
                      {canUpdate && basket.status !== "archived" ? <Button size="compact" variant="quiet" aria-label={`Edit Sub-Basket ${subBasket.name}`} onClick={() => setEditor(subBasket)}>Edit name</Button> : null}
                      {canLifecycle && basket.status !== "archived" ? <Button size="compact" variant="destructive-outline" aria-label={`Delete Sub-Basket ${subBasket.name} permanently`} onClick={() => setDeletion(subBasket)}>Delete</Button> : null}
                    </div>
                  </li>)}
                </ul> : <ul className="knowledge-basket-manager__list" aria-label="Main baskets">
                  {basketsQuery.data?.items.map((entry) => <li key={entry.id} className="knowledge-basket-manager__row">
                    <div className="knowledge-basket-manager__summary">
                      <div><h3>{entry.name}</h3><p>{entry.description ?? "No description provided."}</p></div>
                      <StatusBadge label={entry.status === "active" ? "Active" : entry.status === "inactive" ? "Inactive" : "Archived"} tone={entry.status === "active" ? "success" : entry.status === "archived" ? "danger" : "neutral"} />
                    </div>
                    <div className="knowledge-basket-manager__actions">
                      <Button size="compact" variant="secondary" aria-label={`Manage Sub-Baskets in ${entry.name}`} onClick={() => {
                        focusAfterNavigation.current = true;
                        setSubOffset(0);
                        setSelectedBasket(entry);
                        setAnnouncement("");
                      }}>Manage Sub-Baskets</Button>
                      {canUpdate && entry.status !== "archived" ? <Button size="compact" variant="quiet" aria-label={`Edit ${entry.name}`} onClick={() => onEdit(entry)}>Edit</Button> : null}
                      {canLifecycle ? <Button size="compact" variant="destructive-outline" aria-label={`Delete ${entry.name} permanently`} onClick={() => onDelete(entry)}>Delete</Button> : null}
                    </div>
                  </li>)}
                </ul>}
              {currentOffset > 0 || data.pagination.hasMore ? <nav className="knowledge-pagination knowledge-basket-manager__pagination" aria-label={basket ? "Sub-Basket pages" : "Main basket pages"}>
                <Button variant="secondary" aria-label={basket ? "Previous Sub-Basket page" : "Previous basket page"} disabled={currentOffset === 0 || activeQuery.isFetching} onClick={() => navigatePage(currentOffset - PAGE_SIZE)}>Previous</Button>
                <span>{data.items.length ? data.pagination.offset + 1 : 0}–{Math.min(data.pagination.offset + data.items.length, data.pagination.total)} of {data.pagination.total}</span>
                <Button variant="secondary" aria-label={basket ? "Next Sub-Basket page" : "Next basket page"} disabled={!data.pagination.hasMore || activeQuery.isFetching} onClick={() => navigatePage(currentOffset + PAGE_SIZE)}>Next</Button>
              </nav> : null}
            </> : null}
        </div>
      </div>
    </ContextPanel>
    {basket && editor ? <KnowledgeSubBasketEditor
      basket={basket} existing={editor === "new" ? undefined : editor} fallbackFocusRef={resultsRef}
      onClose={() => setEditor(null)}
      onSaved={(saved) => { setAnnouncement(`Sub-Basket “${saved.name}” saved.`); setEditor(null); }}
    /> : null}
    {basket && deletion ? <KnowledgeSubBasketDeleteDialog
      basket={basket} subBasket={deletion} fallbackFocusRef={resultsRef}
      onClose={() => setDeletion(null)}
      onDeleted={(name) => { setAnnouncement(`Sub-Basket “${name}” was permanently deleted.`); setDeletion(null); }}
    /> : null}
  </>;
}
