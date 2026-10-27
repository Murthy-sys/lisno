import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { PMPanel, PMTab, PMPortfolio, PMOverview, PMPerformance, PMLeaderboard, PMBonus } from "./projectManagerTypes";
export const pmKeys = { all: ["project-manager"] as const };
export const pmPath = (id: string, path: string) => `/projects/${encodeURIComponent(id)}/pm/${path}`;
export const pmKey = () => crypto.randomUUID();
export const pmRecordId = (family: string) => `pm-${family}-${crypto.randomUUID()}`;
export interface PMFilters { q?: string; status?: string; health?: string; offset?: number; limit?: number; }
const queryString = (query: PMFilters) => new URLSearchParams(Object.entries(query).flatMap(([key,value])=>value===undefined?[]:[[key,String(value)]])).toString();
export function usePMQuery<T>(path: string, enabled = true) { const auth=useAuth(); return useQuery({ queryKey: [...pmKeys.all,auth.user?.id,path], queryFn:({signal})=>apiClient.get<T>(path,{signal,showGlobalLoader:false}), enabled:enabled&&auth.status==="authenticated", refetchInterval:15000,refetchIntervalInBackground:false,retry:(count,error)=>!(error instanceof ApiError&&[401,403,404].includes(error.status))&&count<1 }); }
export const usePMPanel = (id: string, tab: PMTab) => usePMQuery<PMPanel>(pmPath(id,tab),Boolean(id));
export const usePMPortfolio = (filters: PMFilters) => usePMQuery<PMPortfolio>(`/project-manager/projects?${queryString(filters)}`);
export const usePMOverview = (id: string) => usePMQuery<PMOverview>(pmPath(id,"overview"),Boolean(id));
export const usePMPerformance = () => usePMQuery<PMPerformance>("/project-manager/performance");
export const usePMLeaderboard = () => usePMQuery<PMLeaderboard>("/project-manager/leaderboard");
export const usePMBonus = () => usePMQuery<PMBonus>("/project-manager/bonus");
export function usePMCommand() { const client=useQueryClient(); return useMutation({ mutationFn:({projectId,path,body,method="post"}:{projectId:string;path:string;body:unknown;method?:"post"|"put"})=>apiClient[method](pmPath(projectId,path),body), onSettled:async()=>{ await Promise.all([["project-manager"],["execution"],["project-workflow"],["project-design-requirements"],["procurement"],["site-completion"],["vendor-work"],["finance"],["admin","project-completion-tasks"]].map(queryKey=>client.invalidateQueries({queryKey}))); } }); }
export async function uploadPMEvidence(projectId:string,entityId:string,files:File[]):Promise<Array<{id:string;name:string;mimeType:string;kind:string}>> { const body=new FormData(); for(const file of files)body.append(file.type.startsWith("image/")||file.type.startsWith("video/")?"mediaFiles":"file",file); return apiClient.postMultipart(pmPath(projectId,`evidence/${encodeURIComponent(entityId)}`),body); }
export const pmDenied = (error:unknown) => error instanceof ApiError&&[401,403,404].includes(error.status);
export const pmError = (error:unknown) => error instanceof Error?error.message:"The request could not be completed. Try again.";
