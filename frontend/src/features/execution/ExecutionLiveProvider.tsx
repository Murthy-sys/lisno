import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryFilters } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { tokenStorage } from "../../api/client";
import { runExecutionStream, type ExecutionConnection } from "./executionStream";
import { projectReadKeys } from "../projects/projectReadQueries";

const Context=createContext<ExecutionConnection>("offline");
export const useExecutionConnection=() => useContext(Context);

export function ExecutionLiveProvider({children}:{children:ReactNode}) {
  const auth=useAuth();
  const token=tokenStorage.get();
  const enabled=auth.status === "authenticated" && hasFrontendPermission(auth.authorization,"execution.tracker.read");
  return <ExecutionSession key={`${auth.user?.id ?? "none"}:${auth.user?.role ?? "none"}:${token ?? "none"}:${enabled}`} enabled={enabled} actorId={auth.user?.id ?? null} actorRole={auth.user?.role ?? null}>{children}</ExecutionSession>;
}
function ExecutionSession({children,enabled,actorId,actorRole}:{children:ReactNode;enabled:boolean;actorId:string|null;actorRole:string|null}) {
  const client=useQueryClient();
  const [connection,setConnection]=useState<ExecutionConnection>("offline");
  const current=useRef<ExecutionConnection>("offline");
  useEffect(() => {
    if(!enabled) return;
    let controller:AbortController | null=null;
    let refreshTimer:ReturnType<typeof setTimeout> | undefined;
    let disposed=false;
    const assignedProjects: QueryFilters = {
      queryKey: projectReadKeys.all,
      predicate: ({ queryKey }) => queryKey.at(-2) === actorId && queryKey.at(-1) === actorRole
    };
    const refresh=() => {
      if(disposed) return;
      for(const queryKey of [["project-manager"],["execution"],["vendor","work"],["vendor-work","progress"],["site-completion"],["project-workflow","project-status"],["admin","project-completion-tasks"],["project-workflow","operational"],["designer","kpi"]]) {
        void client.invalidateQueries({queryKey});
      }
      void client.invalidateQueries(assignedProjects);
    };
    const changed=() => { clearTimeout(refreshTimer); refreshTimer=setTimeout(refresh,80); };
    const status=(value:ExecutionConnection) => { if(!disposed) { current.current=value; setConnection(value); } };
    const clear=() => {
      for(const queryKey of [["project-manager"],["execution"],["vendor","work"],["vendor-work","progress"],["site-completion"],["project-workflow","operational"],["project-workflow","project-status"]]) {
        void client.cancelQueries({queryKey}); client.removeQueries({queryKey});
      }
    };
    const denied=() => {
      if(disposed) return;
      clear();
      // Reset notifies mounted readers immediately, then verifies their independent project access.
      void client.cancelQueries(assignedProjects).then(() => {
        if(!disposed) return client.resetQueries(assignedProjects);
      });
    };
    const start=() => {
      controller?.abort(); controller=null;
      if(document.visibilityState !== "visible" || !navigator.onLine) { status("offline"); return; }
      if(current.current === "denied") return;
      refresh(); controller=new AbortController();
      void runExecutionStream({signal:controller.signal,onStatus:status,onChange:changed,onDenied:denied});
    };
    const poll=setInterval(() => {
      if(document.visibilityState === "visible" && navigator.onLine && ["polling","connecting"].includes(current.current)) refresh();
    },15_000);
    document.addEventListener("visibilitychange",start); window.addEventListener("online",start); window.addEventListener("offline",start); window.addEventListener("focus",refresh);
    start();
    return () => {
      disposed=true; controller?.abort(); clearTimeout(refreshTimer); clearInterval(poll);
      document.removeEventListener("visibilitychange",start); window.removeEventListener("online",start); window.removeEventListener("offline",start); window.removeEventListener("focus",refresh);
      clear();
      void client.cancelQueries(assignedProjects); client.removeQueries(assignedProjects);
    };
  },[client,enabled,actorId,actorRole]);
  return <Context.Provider value={connection}>{children}</Context.Provider>;
}
