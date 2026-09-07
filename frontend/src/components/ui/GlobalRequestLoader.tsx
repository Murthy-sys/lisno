import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
  if (pending === 0 && !pageStatus) return null;

  return createPortal(
    <div className="lisno-request-loader" role="status" aria-label={pageStatus?.statusLabel ?? "Request status"} aria-live="polite" aria-atomic="true">
      <BrandLoadingMark />
      <span className="lisno-loading-message">{pageStatus?.message ?? "Loading Lisno…"}</span>
    </div>,
    document.body
  );
}
