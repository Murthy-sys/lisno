import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { requestActivity } from "../../api/requestActivity";
import { BrandLoadingMark } from "./BrandLoadingMark";

export function GlobalRequestLoader() {
  const pending = useSyncExternalStore(requestActivity.subscribe, requestActivity.getSnapshot, () => 0);
  if (pending === 0) return null;

  return createPortal(
    <div className="lisno-request-loader" role="status" aria-label="Request status" aria-live="polite" aria-atomic="true">
      <BrandLoadingMark />
      <span className="lisno-loading-message">Loading…</span>
    </div>,
    document.body
  );
}
