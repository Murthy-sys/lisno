import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { PMQueryState } from "./PMShared";
import { pmKeys, pmPath } from "./projectManagerApi";
import type { PMPanel, PMTab } from "./projectManagerTypes";

// Notification records can move between pages as new work arrives. Resolve the
// current page on navigation instead of persisting a stale page in the event.
export function PMTargetRecord({ projectId, tab, children }: { projectId: string; tab: PMTab; children: ReactNode }) {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const entity = params.get("entity");
  const locating = params.get("locate") === "1" && Boolean(entity) && tab !== "site";
  const query = useQuery({
    queryKey: [...pmKeys.all, auth.user?.id, "target", projectId, tab, entity],
    enabled: locating,
    retry: false,
    queryFn: async ({ signal }) => {
      let offset = 0;
      while (true) {
        const page = await apiClient.get<PMPanel>(`${pmPath(projectId, tab)}?limit=100&offset=${offset}`, { signal, showGlobalLoader: false });
        const index = page.items.findIndex(item => item.id === entity || item.children?.some(child => child.id === entity));
        if (index >= 0) return { offset: Math.floor((offset + index) / 25) * 25 };
        if (!page.items.length || offset + page.items.length >= page.total) return { offset: null };
        offset += page.items.length;
      }
    }
  });
  useEffect(() => {
    if (locating && query.isSuccess && query.data.offset !== null) setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("locate"); next.set("tabOffset", String(query.data.offset)); return next;
    }, { replace: true });
  }, [locating, query.isSuccess, query.data, setParams]);
  if (!locating) return children;
  return <PMQueryState query={query}>{data => data.offset !== null ? <p role="status">Opening project record…</p> : <div role="status"><p>This update is no longer in the current record list.</p><Button size="compact" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete("locate"); next.delete("entity"); return next; }, { replace: true })}>View current records</Button></div>}</PMQueryState>;
}
