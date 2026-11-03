import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { basketDeletionState, CONFIGURATION_PATH, useOpenBasketVendor } from "./basketDeletionNavigation";
import { getKnowledgeItem, listKnowledgeBaskets, listKnowledgeMainLines, listKnowledgeSubBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { KnowledgeSubBasketDeleteDialog } from "./KnowledgeSubBasketDialogs";
import type { KnowledgeBasket } from "./knowledgeTypes";

/** Restore by stable IDs with fresh catalogs, independently of list filters or the original inline row. */
export function KnowledgeBasketDeletionReturn({ renderMain, fallbackFocusRef }: {
  fallbackFocusRef: RefObject<HTMLElement | null>;
  renderMain?: (basket: KnowledgeBasket, onClose: () => void) => ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const openVendor = useOpenBasketVendor();
  const [target, setTarget] = useState(() => basketDeletionState(location.state, "basketDeletionTarget"));
  const inline = Boolean(target && target.path !== CONFIGURATION_PATH);
  const allowed = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle")
    && (!inline || (hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read")
      && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update")));
  useEffect(() => {
    const incoming = basketDeletionState(location.state, "basketDeletionTarget");
    if (!incoming || incoming.path !== location.pathname) return;
    setTarget(incoming);
    const { basketDeletionTarget: _consumed, ...state } = location.state as Record<string, unknown>;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state });
  }, [location.state, location.pathname, location.search, location.hash, navigate]);
  const lookup = useQuery({
    queryKey: ["ai-estimator-knowledge", "basket-deletion-return", auth.user?.id, target],
    enabled: Boolean(target && target.path === location.pathname && allowed),
    staleTime: 0, gcTime: 0, refetchOnMount: "always", retry: false,
    queryFn: async () => {
      const baskets = await collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, includeArchived: true }), "Main Basket");
      const basket = baskets.items.find(({ id }) => id === target!.basketId);
      if (!basket) throw new Error("This Main Basket is no longer available.");
      if (!target!.subBasketId) return { basket, subBasket: null };
      if (basket.status === "archived") throw new Error("This Main Basket is archived. Its Sub-Baskets are read-only.");
      const subs = await collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(basket.id, page), "Sub-Basket");
      const subBasket = subs.items.find(({ id, basketId }) => id === target!.subBasketId && basketId === basket.id);
      if (!subBasket) throw new Error("This Sub-Basket is no longer available under the Main Basket.");
      if (inline) {
        const sourceId = decodeURIComponent(target!.path.slice(`${CONFIGURATION_PATH}/items/`.length));
        const source = await getKnowledgeItem(sourceId);
        if (source.mainLineId !== sourceId || source.status === "archived" || source.draftRevision?.status !== "draft"
          || !source.allowedActions.includes("update_section")) {
          throw new Error("The source item is no longer editable. Review it in Configuration before removing this group.");
        }
        if (source.basketId === basket.id && source.subBasketId === subBasket.id) {
          throw new Error("This Sub-Basket contains the item whose recommendations you were editing. It cannot be removed from this workspace.");
        }
        const members = await collectAllKnowledgeMasterPages((page) => listKnowledgeMainLines(basket.id, { ...page, includeArchived: true }), "Main Line");
        if (members.items.some(item => item.basketId === basket.id && item.subBasketId === subBasket.id && item.status !== "draft")) {
          throw new Error("This Sub-Basket is frozen because at least one item has left Draft. Review it in Configuration.");
        }
      }
      return { basket, subBasket };
    }
  });
  if (!target || target.path !== location.pathname) return null;
  const close = () => { setTarget(null); requestAnimationFrame(() => fallbackFocusRef.current?.focus()); };
  if (!allowed || lookup.isError) return <InlineMessage tone="warning" title="Basket deletion could not reopen">
    {!allowed ? "You no longer have permission to delete this basket." : lookup.error?.message}
    <div className="knowledge-dialog-actions">
      {allowed ? <Button variant="secondary" onClick={() => void lookup.refetch()}>Retry basket lookup</Button> : null}
      <Button variant="quiet" onClick={() => { close(); navigate(CONFIGURATION_PATH, { replace: true }); }}>Back to Configuration</Button>
    </div>
  </InlineMessage>;
  if (!lookup.data || lookup.isFetching) return <InlineMessage tone="info" role="status">Loading the current basket before checking deletion…</InlineMessage>;
  const { basket, subBasket } = lookup.data;
  if (subBasket) return <KnowledgeSubBasketDeleteDialog key={`${basket.id}:${subBasket.id}`} basket={basket} subBasket={subBasket} inline={inline} fallbackFocusRef={fallbackFocusRef}
    onOpenVendor={(vendorId) => openVendor(vendorId, basket.id, subBasket.id)} onClose={close} onDeleted={close} />;
  return renderMain?.(basket, close) ?? null;
}
