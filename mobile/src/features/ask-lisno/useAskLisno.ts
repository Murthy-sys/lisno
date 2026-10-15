import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { ApiError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { askLisnoFailure, classifyAskLisnoFailure, createAskLisnoApi, isAskLisnoDenied, type AskLisnoFailureKind, type AskLisnoInput, type AskLisnoResponse } from "./askLisnoApi";

export interface AskLisnoTurn {
  id: number;
  message: string;
  createdAt: string;
  choiceProjectId?: string;
  response?: AskLisnoResponse;
  error?: string;
  errorKind?: AskLisnoFailureKind;
  listError?: string | undefined;
  listChanged?: boolean;
  pricingNeedsRefresh?: boolean;
}
type Access = "checking" | "ready" | "error" | "hidden";

export function useAskLisno(runtime: MobileRuntime, initialProjectId?: string) {
  const api = useMemo(() => createAskLisnoApi(runtime), [runtime]);
  const [turns, setTurns] = useState<AskLisnoTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [contextProjectId, setContextProjectId] = useState<string | null>(null);
  const [ignorePageHint, setIgnorePageHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pagingId, setPagingId] = useState<number | null>(null);
  const [access, setAccess] = useState<Access>("checking");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const sequence = useRef(0);
  const focused = useRef(false);
  const foreground = useRef(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const latest = useRef({ turns, draft, contextProjectId, ignorePageHint, access });
  latest.current = { turns, draft, contextProjectId, ignorePageHint, access };

  const stop = useCallback(() => {
    generation.current += 1;
    controller.current?.abort(); controller.current = null;
    setBusy(false); setPagingId(null); setAccess("hidden");
    setTurns(previous => previous.map(turn => turn.response?.answer.projectPricing ? { ...turn, pricingNeedsRefresh: true, response: { ...turn.response, answer: { ...turn.response.answer, projectPricing: null } } } : !turn.response && !turn.error ? { ...turn, errorKind: "paused", error: "The answer was paused when you left. Retry when you are ready." } : turn));
  }, []);
  const clearDenied = useCallback(() => {
    setTurns([]); setDraft(""); setContextProjectId(null); setIgnorePageHint(true);
    setNotice("This conversation is no longer available for your current access.");
    setAccess("ready");
  }, []);

  const verify = useCallback(async () => {
    if (!focused.current || !foreground.current) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const version = ++generation.current;
    const current = latest.current;
    const ids = new Set<string>();
    if (initialProjectId && !current.ignorePageHint) ids.add(initialProjectId);
    if (current.contextProjectId) ids.add(current.contextProjectId);
    for (const turn of current.turns) {
      if (turn.response?.projectId) ids.add(turn.response.projectId);
      if (turn.choiceProjectId) ids.add(turn.choiceProjectId);
      for (const choice of turn.response?.resolution?.choices ?? []) ids.add(choice.id);
      for (const item of turn.response?.projectList?.items ?? []) ids.add(item.id);
    }
    setAccess("checking");
    try {
      // A bounded batch avoids flooding the API after several directory pages.
      const projects = [...ids];
      for (let offset = 0; offset < projects.length; offset += 4) {
        await Promise.all(projects.slice(offset, offset + 4).map(id => api.verifyProject(id, request.signal)));
        if (version !== generation.current || request.signal.aborted) return;
      }
      if (version === generation.current && !request.signal.aborted) setAccess("ready");
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (isAskLisnoDenied(error)) clearDenied(); else setAccess("error");
    } finally { if (version === generation.current) controller.current = null; }
  }, [api, clearDenied, initialProjectId]);

  useFocusEffect(useCallback(() => {
    focused.current = true; void verify();
    return () => { focused.current = false; stop(); };
  }, [stop, verify]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      foreground.current = state === "active";
      if (!foreground.current) stop(); else if (focused.current) void verify();
    });
    return () => { subscription.remove(); generation.current += 1; controller.current?.abort(); };
  }, [stop, verify]);

  async function send(options: { retry?: AskLisnoTurn; choiceProjectId?: string; suggestion?: string } = {}) {
    const current = latest.current;
    const message = (options.retry?.message ?? options.suggestion ?? current.draft).trim();
    if (!message || message.length > 2000 || controller.current || current.access !== "ready" || !focused.current || !foreground.current) return;
    // Pressing Send with the retained failed question is also a retry of that turn.
    const last = current.turns.at(-1);
    const retry = options.retry ?? (!options.suggestion && last?.error && last.message === message ? last : undefined);
    const previous = retry ? current.turns.slice(0, current.turns.findIndex(item => item.id === retry.id)) : current.turns;
    const choiceProjectId = options.choiceProjectId ?? retry?.choiceProjectId;
    const turn: AskLisnoTurn = { id: retry?.id ?? ++sequence.current, message, createdAt: retry?.createdAt ?? new Date().toISOString(), ...(choiceProjectId ? { choiceProjectId } : {}) };
    const input: AskLisnoInput = {
      projectId: current.ignorePageHint ? null : initialProjectId ?? null, contextProjectId: current.contextProjectId,
      ...(choiceProjectId ? { choiceProjectId } : {}), message,
      history: previous.filter((item, index) => item.response && (item.response.resolution?.state !== "clarification" || index === previous.length - 1)).slice(-15).map(item => ({ body: item.message, projectId: item.response!.resolution?.state === "clarification" ? null : item.response!.projectId }))
    };
    const request = new AbortController(); controller.current = request;
    const version = ++generation.current;
    setBusy(true); setNotice(""); setDraft(""); setTurns([...previous, turn]);
    try {
      const response = await api.ask(input, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      if (!response.resolution || response.resolution.state === "resolved") setContextProjectId(response.projectId);
      setTurns([...previous, { ...turn, response }]);
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (isAskLisnoDenied(error)) clearDenied();
      else { setTurns([...previous, { ...turn, error: askLisnoFailure(error), errorKind: classifyAskLisnoFailure(error) }]); setDraft(message); }
    } finally { if (version === generation.current) { controller.current = null; setBusy(false); } }
  }

  async function loadProjects(turn: AskLisnoTurn, refresh = false) {
    const list = turn.response?.projectList;
    if (!list || controller.current || latest.current.access !== "ready" || !focused.current || !foreground.current || (!refresh && list.nextOffset === null)) return;
    const request = new AbortController(); controller.current = request;
    const version = ++generation.current; setPagingId(turn.id);
    setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, listError: undefined } : item));
    try {
      const response = await api.ask({ projectId: null, contextProjectId: null, message: turn.message, history: [], ...(refresh ? {} : { projectListPage: { offset: list.nextOffset!, version: list.version } }) }, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      const page = response.projectList;
      if (!page || page.offset !== (refresh ? 0 : list.nextOffset) || (!refresh && page.version !== list.version)) throw new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Projects changed");
      setTurns(previous => previous.map(item => item.id !== turn.id || !item.response ? item : {
        ...item, listChanged: false, listError: undefined,
        response: { ...(refresh ? response : item.response), projectList: { ...page, offset: 0, items: [...new Map([...(refresh ? [] : list.items), ...page.items].map(project => [project.id, project])).values()] } }
      }));
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (isAskLisnoDenied(error)) clearDenied();
      else setTurns(previous => previous.map(item => item.id !== turn.id ? item : error instanceof ApiError && error.code === "ASK_LISNO_PROJECT_LIST_CHANGED" && item.response?.projectList ? {
        ...item, listChanged: true, listError: undefined, response: { ...item.response, projectList: { ...item.response.projectList, items: [], nextOffset: null } }
      } : { ...item, listError: askLisnoFailure(error) }));
    } finally { if (version === generation.current) { controller.current = null; setPagingId(null); } }
  }
  return { turns, draft, setDraft, contextProjectId, busy, pagingId, access, notice, send, loadProjects, verify };
}
