import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PMRequestsPanel } from "./PMRequestsPanel";
import { PMOperationsPanel } from "./PMOperationsPanel";
import { usePMQuery } from "./projectManagerApi";
import { PMQueryState } from "./PMShared";
import type { ExecutionPage } from "../execution/executionApi";
import "./project-manager.css";
export function PMCounterpartPanel({projectId}:{projectId:string}){const auth=useAuth();const [params]=useSearchParams();const [open,setOpen]=useState(params.has("pm"));if(!projectId||!hasFrontendPermission(auth.authorization,"pm.workspace.read")||auth.user?.role==="site_manager"||auth.user?.role==="super_admin")return null;const role=auth.user?.role;return <details className="pm-workspace pm-counterpart" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Project coordination</summary>{open?<>{role==="procurement"?<PMRequestsPanel projectId={projectId} tab="procurement"/>:null}{role==="designer"?<PMRequestsPanel projectId={projectId} tab="supply"/>:null}{["procurement","designer","finance_head","vendor"].includes(role??"")?<PMOperationsPanel projectId={projectId} tab="vendors"/>:null}{role==="client"?<PMOperationsPanel projectId={projectId} tab="client"/>:null}</>:null}</details>;}
export function PMVendorCoordination(){const [params]=useSearchParams();const [open,setOpen]=useState(params.has("pm"));const [offset,setOffset]=useState(0);const query=usePMQuery<ExecutionPage>(`/vendor/work/execution?limit=50&offset=${offset}`,open);return <details className="pm-workspace pm-counterpart" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Project notices</summary>{open?<PMQueryState query={query}>{data=><>{[...new Map(data.items.map(item=>[item.projectId,item.projectName])).entries()].map(([id,name])=><section key={id}><h2>{name}</h2><PMCounterpartPanel projectId={id}/></section>)}{data.total>50?<div className="pm-actions"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous work</button><button disabled={offset+50>=data.total} onClick={()=>setOffset(offset+50)}>Next work</button></div>:null}</>}</PMQueryState>:null}</details>;}
