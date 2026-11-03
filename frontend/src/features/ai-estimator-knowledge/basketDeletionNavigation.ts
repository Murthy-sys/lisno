import { useLocation, useNavigate } from "react-router-dom";

export const CONFIGURATION_PATH = "/admin/configuration/estimation";
export interface BasketDeletionContext {
  path: string;
  basketId: string;
  subBasketId?: string;
}

const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0
  && value.length <= 240 && !/[\u0000-\u001f\u007f]/u.test(value);

/** Only Configuration routes can be restored. History state carries no delete authorization. */
export function readBasketDeletionContext(value: unknown): BasketDeletionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { path, basketId, subBasketId } = value as Record<string, unknown>;
  if (typeof path !== "string" || !validId(basketId) || (subBasketId !== undefined && !validId(subBasketId))) return null;
  if (path !== CONFIGURATION_PATH) {
    const match = /^\/admin\/configuration\/estimation\/items\/([^/?#]+)$/u.exec(path);
    if (!match || !subBasketId) return null;
    try {
      const itemId = decodeURIComponent(match[1]);
      if (!validId(itemId) || /[/\\]/u.test(itemId) || itemId === "." || itemId === "..") return null;
    } catch { return null; }
  }
  return { path, basketId, ...(subBasketId ? { subBasketId } : {}) };
}

export function basketDeletionState(state: unknown, key: "basketDeletionReturn" | "basketDeletionTarget") {
  return state && typeof state === "object" ? readBasketDeletionContext((state as Record<string, unknown>)[key]) : null;
}

export function useOpenBasketVendor() {
  const location = useLocation();
  const navigate = useNavigate();
  return (vendorId: string, basketId: string, subBasketId?: string) => {
    const context = readBasketDeletionContext({ path: location.pathname, basketId, subBasketId });
    if (!context || !validId(vendorId)) return;
    // Ordinary router navigation preserves the Configuration workspace's unsaved-change guard.
    navigate(`/admin/procurement/vendors/${encodeURIComponent(vendorId)}`, { state: { basketDeletionReturn: context } });
  };
}
