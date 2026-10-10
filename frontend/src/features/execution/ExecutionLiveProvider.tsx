import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { tokenStorage } from "../../api/client";
import { runExecutionStream, type ExecutionConnection } from "./executionStream";

const Context=createContext<ExecutionConnection>("offline");
export const useExecutionConnection=() => useContext(Context);

export function ExecutionLiveProvider({children}:{children:ReactNode}) {
  const auth=useAuth();
  const token=tokenStorage.get();
  const enabled=auth.status === "authenticated" && hasFrontendPermission(auth.authorization,"execution.tracker.read");
  return <ExecutionSession key={`${auth.user?.id ?? "none"}:${token ?? "none"}:${enabled}`} enabled={enabled}>{children}</ExecutionSession>;
}
function ExecutionSession({children,enabled}:{children:ReactNode;enabled:boolean}) {
  const client=useQueryClient();
  const [connection,setConnection]=useState<ExecutionConnection>("offline");
  const current=useRef<ExecutionConnection>("offline");
  useEffect(() => {
    if(!enabled) return;
    let controller:AbortController | null=null;
    let refreshTimer:ReturnType<typeof setTimeout> | undefined;
    let disposed=false;
    const refresh=() => {
      if(disposed) return;
      for(const queryKey of [["execution"],["vendor","work"],["vendor-work","progress"],["site-completion"],["project-workflow","project-status"],["admin","project-completion-tasks"],["project-workflow","operational"],["designer","kpi"]]) {
        void client.invalidateQueries({queryKey});
      }
    };
    const changed=() => { clearTimeout(refreshTimer); refreshTimer=setTimeout(refresh,80); };
    const status=(value:ExecutionConnection) => { if(!disposed) { current.current=value; setConnection(value); } };
    const clear=() => {
      for(const queryKey of [["execution"],["vendor","work"],["vendor-work","progress"],["site-completion"],["project-workflow","operational"],["project-workflow","project-status"]]) {
        void client.cancelQueries({queryKey}); client.removeQueries({queryKey});
      }
    };
    const start=() => {
      controller?.abort(); controller=null;
      if(document.visibilityState !== "visible" || !navigator.onLine) { status("offline"); return; }
      if(current.current === "denied") return;
      refresh(); controller=new AbortController();
      void runExecutionStream({signal:controller.signal,onStatus:status,onChange:changed,onDenied:clear});
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
    };
  },[client,enabled]);
  return <Context.Provider value={connection}>{children}</Context.Provider>;
}
