import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { requestActivity } from "../../api/requestActivity";
import { BrandLoadingMark } from "./BrandLoadingMark";

interface LoadingStatus {
  readonly message: string;
  readonly statusLabel: string;
}

const LoadingContext = createContext<((status: LoadingStatus) => () => void) | null>(null);

/** Page and section states share the same visual as pending API requests. */
export function LoadingProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<ReadonlyMap<symbol, LoadingStatus>>(() => new Map());
  const register = useCallback((status: LoadingStatus) => {
    const key = Symbol();
    setPages((current) => new Map(current).set(key, status));
    return () => setPages((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  return <LoadingContext.Provider value={register}>
    {children}
    <GlobalRequestLoader pageStatus={pages.values().next().value} />
  </LoadingContext.Provider>;
}

export function useSharedLoadingStatus({ message, statusLabel }: LoadingStatus) {
  const register = useContext(LoadingContext);
  useLayoutEffect(() => register?.({ message, statusLabel }), [register, message, statusLabel]);
  return register !== null;
}

export function GlobalRequestLoader({ pageStatus }: { pageStatus?: LoadingStatus } = {}) {
  const pending = useSyncExternalStore(requestActivity.subscribe, requestActivity.getSnapshot, () => 0);
  const active = pending > 0 || Boolean(pageStatus);
  const visible = useStableLoadingIndicator(active);
  if (!active && !visible) return null;

  return createPortal(
    <div className="lisno-request-loader" data-visible={visible || undefined} role={active ? "status" : undefined} aria-hidden={!active || undefined} aria-label={pageStatus?.statusLabel ?? "Request status"} aria-live="polite" aria-atomic="true">
      <span aria-hidden="true" style={{ visibility: visible ? "visible" : "hidden" }}><BrandLoadingMark /></span>
      <span className="lisno-loading-message">{pageStatus?.message ?? "Loading Lisno…"}</span>
    </div>,
    document.body
  );
}

/** Ignore fast requests and bridge short gaps between consecutive page reads. */
function useStableLoadingIndicator(active: boolean) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active && !visible) {
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, 180);
      return () => window.clearTimeout(timer);
    }
    if (!active && visible) {
      const timer = window.setTimeout(() => setVisible(false), Math.max(0, 350 - (Date.now() - shownAt.current)));
      return () => window.clearTimeout(timer);
    }
  }, [active, visible]);
  return visible;
}
