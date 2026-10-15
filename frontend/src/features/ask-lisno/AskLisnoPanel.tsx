import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { OverlayPortal } from "../../components/ui/overlay";
import { AssistantAnswerContent } from "../messages/ChatAssistantResult";
import { LisnoChatMark } from "../messages/LisnoChatMark";
import { askLisnoApi, type AskLisnoInput, type AskLisnoProjectList, type AskLisnoResponse } from "./askLisnoApi";
import { AskLisnoProjectCard, getAskLisnoProjectSummary } from "./AskLisnoProjectCard";
import { AskLisnoQuickPrompts } from "./AskLisnoQuickPrompts";
import { assistantFailureMessage } from "./assistantFailureMessage";
import "./askLisno.css";

interface Turn { id: string; message: string; sentAt: string; receivedAt?: string; response?: AskLisnoResponse; error?: string; choiceProjectId?: string; listError?: string; listChanged?: boolean; pricingNeedsRefresh?: boolean }
const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

function MessageTime({ value, label }: { value: string; label: string }) {
  const date = new Date(value);
  return <time className="ask-lisno-panel__timestamp" dateTime={value} aria-label={`${label} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`} title={date.toLocaleString()}>{date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>;
}

function AnswerProjectContext({ response }: { response: AskLisnoResponse }) {
  const project = response.resolution?.project;
  if (response.resolution?.state !== "resolved" || !project?.id || project.id !== response.projectId || !project.name.trim() || getAskLisnoProjectSummary(response)) return null;
  return <p className="ask-lisno-panel__project-name">{project.name}</p>;
}

function HeaderBotanical() {
  return <svg className="ask-lisno-panel__botanical" viewBox="0 0 140 95" fill="none" aria-hidden="true" focusable="false">
    <path d="M134 94C103 68 81 33 39 16" stroke="currentColor" strokeWidth="1.5" />
    <path d="M103 65C75 64 59 45 56 24C80 29 95 43 103 65Z" fill="currentColor" opacity=".58" />
    <path d="M80 40C53 40 29 26 23 6C51 9 71 20 80 40Z" fill="currentColor" opacity=".36" />
    <path d="M103 65C108 43 111 23 104 8C98 27 95 43 103 65Z" fill="currentColor" opacity=".22" />
    <path d="M94 56C66 46 47 49 34 59C58 71 77 67 94 56Z" fill="currentColor" opacity=".24" />
    <path d="M125 83C122 62 125 44 139 30C141 57 136 72 125 83Z" fill="currentColor" opacity=".16" />
  </svg>;
}

function directoryRows(items: AskLisnoProjectList["items"]) {
  const groups = new Map<string, string[]>();
  const normalize = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  for (const project of items) {
    const label = JSON.stringify([normalize(project.name), normalize(project.detail)]);
    groups.set(label, [...(groups.get(label) ?? []), project.id]);
  }
  const references = new Map<string, string>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    let length = 8;
    const maximum = Math.max(...ids.map(id => id.length));
    while (length < maximum && new Set(ids.map(id => id.slice(-length))).size < ids.length) length += 1;
    for (const id of ids) references.set(id, `Reference ${id.slice(-length)}`);
  }
  return items.map(project => ({ ...project, reference: references.get(project.id) }));
}

export function AskLisnoPanel({ open, onClose, routeProjectId, scope, returnFocusRef, displayName }: {
  open: boolean; onClose: () => void; routeProjectId?: string; scope: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>; displayName?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [contextProjectId, setContextProjectId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pagingId, setPagingId] = useState<string | null>(null);
  const [historyAccess, setHistoryAccess] = useState<"unchecked" | "checking" | "ready" | "error">("unchecked");
  const [notice, setNotice] = useState("");
  const [ignorePageHint, setIgnorePageHint] = useState(false);
  const [viewport, setViewport] = useState<CSSProperties>({});
  const [expanded, setExpanded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const paging = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const verification = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);

  function stopPaging() { paging.current?.abort(); paging.current = null; setPagingId(null); }
  function stop() {
    setTurns(current => current.map(turn => {
      if (turn.response?.answer.projectPricing) return { ...turn, pricingNeedsRefresh: true, response: { ...turn.response, answer: { ...turn.response.answer, projectPricing: null } } };
      return !turn.response && !turn.error ? { ...turn, error: "The answer was paused when you left. Retry when you are ready." } : turn;
    }));
    generation.current += 1; controller.current?.abort(); controller.current = null;
    stopPaging(); verification.current?.abort(); verification.current = null;
    setBusy(false); setHistoryAccess("unchecked");
  }

  function close() {
    stop(); onClose();
    if (!returnFocusRef.current?.closest("[inert]")) returnFocusRef.current?.focus();
  }
  useEffect(() => () => { generation.current += 1; controller.current?.abort(); paging.current?.abort(); verification.current?.abort(); }, []);
  useEffect(() => {
    stop(); setTurns([]); setContextProjectId(null); setDraft(""); setNotice(""); setIgnorePageHint(false); setExpanded(false);
    // The new session has no retained project history to verify. Its first
    // request still goes through the backend's current authorization checks.
    setHistoryAccess(open ? "ready" : "unchecked");
  }, [scope]);
  useEffect(() => {
    if (!open) { stop(); return; }
    void verifyHistory();
    // This is a non-modal window: do not trap focus, isolate the page or lock scrolling.
    const timer = window.setTimeout(() => { if (!panel.current?.closest("[inert]")) composer.current?.focus(); }, 0);
    const visible = window.visualViewport;
    const resize = () => {
      const height = visible?.height ?? window.innerHeight;
      const bottom = Math.max(0, window.innerHeight - height - (visible?.offsetTop ?? 0));
      setViewport({ "--ask-visible-height": `${height}px`, "--ask-keyboard-offset": `${bottom}px` } as CSSProperties);
    };
    resize(); visible?.addEventListener("resize", resize); visible?.addEventListener("scroll", resize); window.addEventListener("resize", resize);
    return () => { window.clearTimeout(timer); visible?.removeEventListener("resize", resize); visible?.removeEventListener("scroll", resize); window.removeEventListener("resize", resize); };
  }, [open]);
  useEffect(() => { log.current?.scrollTo?.({ top: log.current.scrollHeight }); }, [turns, busy, open]);
  useEffect(() => {
    const input = composer.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [draft, open, expanded, viewport, historyAccess]);

  async function verifyHistory() {
    verification.current?.abort();
    const request = new AbortController();
    verification.current = request;
    const version = ++generation.current;
    const projectIds = new Set<string>();
    if (contextProjectId) projectIds.add(contextProjectId);
    for (const turn of turns) {
      if (turn.response?.projectId) projectIds.add(turn.response.projectId);
      if (turn.choiceProjectId) projectIds.add(turn.choiceProjectId);
      for (const choice of turn.response?.resolution?.choices ?? []) projectIds.add(choice.id);
      for (const project of turn.response?.projectList?.items ?? []) projectIds.add(project.id);
    }
    if (!projectIds.size) { setHistoryAccess("ready"); verification.current = null; return; }
    setHistoryAccess("checking");
    try {
      await Promise.all([...projectIds].map(id => askLisnoApi.verifyProject(id, request.signal)));
      if (version !== generation.current || request.signal.aborted) return;
      setHistoryAccess("ready");
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (denied(error)) {
        setTurns([]); setDraft(""); setContextProjectId(null); setIgnorePageHint(true);
        setNotice("This conversation is no longer available for your current access.");
        setHistoryAccess("ready");
      } else setHistoryAccess("error");
    } finally {
      if (version === generation.current) verification.current = null;
    }
  }

  const currentVerify = useRef(verifyHistory);
  currentVerify.current = verifyHistory;
  useEffect(() => {
    if (!open) return;
    const hide = () => stop();
    const resume = () => { if (document.visibilityState !== "hidden") void currentVerify.current(); };
    const visibility = () => document.visibilityState === "hidden" ? hide() : resume();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", hide); window.removeEventListener("focus", resume); };
  }, [open]);

  async function send(retry?: Turn, choiceProjectId?: string, suggestion?: string) {
    const message = retry?.message ?? suggestion ?? draft.trim();
    if (!message || controller.current || historyAccess !== "ready") return;
    const choice = choiceProjectId ?? retry?.choiceProjectId;
    const turn: Turn = { id: retry?.id ?? crypto.randomUUID(), message, sentAt: retry?.sentAt ?? new Date().toISOString(), ...(choice ? { choiceProjectId: choice } : {}) };
    const previous = retry ? turns.slice(0, turns.findIndex(item => item.id === retry.id)) : turns;
    const input: AskLisnoInput = {
      projectId: ignorePageHint ? null : routeProjectId ?? null,
      contextProjectId,
      ...(choice ? { choiceProjectId: choice } : {}),
      message,
      history: previous.filter((item, index) => item.response && (item.response.resolution?.state !== "clarification" || index === previous.length - 1)).slice(-15).map(item => ({ body: item.message, projectId: item.response!.resolution?.state === "clarification" ? null : item.response!.projectId }))
    };
    while (input.history.length && new TextEncoder().encode(JSON.stringify(input)).byteLength > 32_768) input.history.shift();
    const request = new AbortController();
    stopPaging();
    controller.current = request;
    const version = ++generation.current;
    const startedInPanel = Boolean(panel.current?.contains(document.activeElement));
    let movedOutside = false;
    const noteOutsideInteraction = (event: Event) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) movedOutside = true;
    };
    const stopTrackingFocus = () => {
      document.removeEventListener("focusin", noteOutsideInteraction);
      document.removeEventListener("pointerdown", noteOutsideInteraction);
      request.signal.removeEventListener("abort", stopTrackingFocus);
    };
    document.addEventListener("focusin", noteOutsideInteraction);
    document.addEventListener("pointerdown", noteOutsideInteraction);
    request.signal.addEventListener("abort", stopTrackingFocus, { once: true });
    setBusy(true); setDraft(""); setNotice(""); setTurns([...previous, turn]);
    try {
      const response = await askLisnoApi.ask(input, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      if (!response.resolution || response.resolution.state === "resolved") setContextProjectId(response.projectId);
      setTurns([...previous, { ...turn, response, receivedAt: new Date().toISOString() }]); setDraft("");
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (denied(error)) {
        setTurns([]); setDraft(""); setNotice("This conversation is no longer available for your current access.");
        setContextProjectId(null); setIgnorePageHint(true);
      } else { setTurns([...previous, { ...turn, error: assistantFailureMessage(error) }]); setDraft(message); }
    } finally {
      stopTrackingFocus();
      if (version === generation.current) {
        setBusy(false); controller.current = null;
        // Disabling the selected row can return browser focus to body. Restore that
        // interaction without pulling focus back from deliberate page navigation.
        const lostControlFocus = startedInPanel && !movedOutside && document.activeElement === document.body;
        if (panel.current && (panel.current.contains(document.activeElement) || lostControlFocus) && !panel.current.closest("[inert]")) composer.current?.focus();
      }
    }
  }

  async function loadProjects(turn: Turn, refresh = false) {
    const list = turn.response?.projectList;
    if (!list || controller.current || paging.current || historyAccess !== "ready" || (!refresh && list.nextOffset === null)) return;
    const request = new AbortController();
    const version = ++generation.current;
    paging.current = request; setPagingId(turn.id);
    setTurns(current => current.map(item => item.id === turn.id ? { ...item, listError: undefined } : item));
    try {
      const response = await askLisnoApi.ask({ projectId: null, contextProjectId: null, message: turn.message, history: [], ...(refresh ? {} : { projectListPage: { offset: list.nextOffset!, version: list.version } }) }, request.signal);
      if (version !== generation.current || request.signal.aborted) return;
      const page = response.projectList;
      if (!page || page.offset !== (refresh ? 0 : list.nextOffset) || (!refresh && page.version !== list.version)) {
        throw new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Projects changed");
      }
      setTurns(current => current.map(item => {
        if (item.id !== turn.id || !item.response) return item;
        const items = [...new Map([...(refresh ? [] : list.items), ...page.items].map(project => [project.id, project])).values()];
        return { ...item, listChanged: false, listError: undefined, response: { ...(refresh ? response : item.response), projectList: { ...page, offset: 0, items } } };
      }));
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (denied(error)) {
        setTurns([]); setDraft(""); setContextProjectId(null); setIgnorePageHint(true);
        setNotice("This conversation is no longer available for your current access.");
      } else if (error instanceof ApiError && error.code === "ASK_LISNO_PROJECT_LIST_CHANGED") {
        setTurns(current => current.map(item => item.id === turn.id && item.response?.projectList ? { ...item, listChanged: true, listError: undefined, response: { ...item.response, projectList: { ...item.response.projectList, items: [], nextOffset: null } } } : item));
      } else {
        setTurns(current => current.map(item => item.id === turn.id ? { ...item, listError: error instanceof ApiError && error.status === 429 ? "The request limit has been reached. Please try again later." : "Projects could not be loaded. Please try again." } : item));
      }
    } finally {
      if (version === generation.current) { paging.current = null; setPagingId(null); }
    }
  }

  if (!open) return null;
  const firstName = displayName?.trim().split(/\s+/u)[0] || "there";
  return <OverlayPortal><section ref={panel} id="ask-lisno-panel" role="dialog" aria-modal="false" aria-labelledby="ask-lisno-title" className={`ask-lisno-panel${expanded ? " ask-lisno-panel--expanded" : ""}`} style={viewport} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented && !panel.current?.closest("[inert]")) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <header className="ask-lisno-panel__header">
      <HeaderBotanical />
      <div className="ask-lisno-panel__identity"><LisnoChatMark /><div><div className="ask-lisno-panel__title"><h2 id="ask-lisno-title">Ask Lisno</h2><span className="ask-lisno-panel__identity-dot" aria-hidden="true" /></div><p>Your project assistant</p></div></div>
      <div className="ask-lisno-panel__window-actions">
        <button type="button" className="ask-lisno-panel__window-button" onClick={close} aria-label="Minimize Ask Lisno" title="Minimize"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14" /></svg></button>
        <button type="button" className="ask-lisno-panel__window-button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Restore Ask Lisno size" : "Expand Ask Lisno"} aria-pressed={expanded} title={expanded ? "Restore size" : "Expand"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{expanded ? <><path d="M9 3v6H3M15 21v-6h6M3 9l6-6M21 15l-6 6" /></> : <><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>}</svg></button>
        <button type="button" className="ask-lisno-panel__window-button" onClick={close} aria-label="Close Ask Lisno" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </div>
    </header>
    <div className="ask-lisno-panel__conversation" ref={log} role="log" aria-label="Private conversation" aria-live="polite" aria-busy={busy || historyAccess === "checking"}>
      {historyAccess === "ready" ? <div className="ask-lisno-panel__welcome ask-lisno-panel__assistant-row"><span className="ask-lisno-panel__avatar"><LisnoChatMark /></span><div className="ask-lisno-panel__message"><div className="ask-lisno-panel__bubble ask-lisno-panel__welcome-bubble"><h3>Hi {firstName}!</h3><p>Ask about your projects, progress, timelines or published estimates. This conversation stays private and is not posted in Project messages.</p></div></div></div> : null}
      {notice ? <p role="alert" className="ask-lisno-panel__notice">{notice}</p> : null}
      {historyAccess === "checking" || historyAccess === "unchecked" ? <p role="status">Checking access to your conversation…</p> : null}
      {historyAccess === "error" ? <div><p role="alert">Your conversation access could not be checked.</p><Button variant="quiet" size="compact" onClick={() => void verifyHistory()}>Retry conversation</Button></div> : null}
      {historyAccess === "ready" ? turns.map((turn, index) => <div key={turn.id} className="ask-lisno-panel__turn"><div className="ask-lisno-panel__user-message"><p className="ask-lisno-panel__question"><span className="sr-only">You: </span>{turn.message}</p><MessageTime value={turn.sentAt} label="Sent at" /></div>
        {turn.response ? <div className="ask-lisno-panel__answer ask-lisno-panel__assistant-row"><span className="ask-lisno-panel__avatar ask-lisno-panel__speaker"><LisnoChatMark /><span className="sr-only">Lisno AI</span></span><div className="ask-lisno-panel__message"><AnswerProjectContext response={turn.response} /><div className="ask-lisno-panel__bubble ask-lisno-panel__answer-bubble">
          {turn.listChanged ? <p role="status">Your project list has changed. Refresh it to see the current projects.</p> : turn.response.resolution?.state === "clarification" ? <div className="ask-lisno-panel__clarification"><p>{turn.response.resolution.question ?? "Which project would you like to discuss?"}</p><div>{directoryRows(turn.response.resolution.choices).map(choice => <button key={choice.id} type="button" disabled={busy || index !== turns.length - 1} onClick={() => void send(turn, choice.id)}>{choice.name}{choice.detail ? <small>{choice.detail}</small> : null}{choice.reference ? <small>{choice.reference}</small> : null}</button>)}</div></div> : <><AssistantAnswerContent result={{ ...turn.response.answer, checkedAt: turn.response.checkedAt, stale: false, commercialAccess: turn.response.answer.projectPricing ? "allowed" : "none" }} />{turn.pricingNeedsRefresh ? <p className="ask-lisno-panel__privacy-note">Estimate details need a fresh check. <Button variant="quiet" size="compact" disabled={busy} onClick={() => void send(undefined, turn.response?.projectId ?? undefined, turn.message)}>Refresh estimate</Button></p> : null}<AskLisnoProjectCard response={turn.response} /></>}
          {turn.response.projectList ? <section className="ask-lisno-panel__projects" aria-label="Your projects" aria-busy={pagingId === turn.id}>
            {turn.response.projectList.items.length ? <ul>{directoryRows(turn.response.projectList.items).map(project => <li key={project.id}><div><strong>{project.name}</strong>{project.detail ? <small>{project.detail}</small> : null}{project.reference ? <small>{project.reference}</small> : null}</div><button type="button" disabled={busy} aria-label={`View progress for ${project.name}${project.detail ? `, ${project.detail}` : ""}${project.reference ? `, ${project.reference}` : ""}`} onClick={() => void send(undefined, project.id, "Show my project progress")}>View progress</button></li>)}</ul> : null}
            {turn.listError ? <p role="alert">{turn.listError}</p> : null}
            {pagingId === turn.id ? <p role="status">Loading projects…</p> : null}
            {turn.listChanged ? <Button variant="quiet" size="compact" disabled={busy || pagingId !== null} onClick={() => void loadProjects(turn, true)}>Refresh projects</Button> : turn.response.projectList.nextOffset !== null ? <Button variant="quiet" size="compact" disabled={busy || pagingId !== null} onClick={() => void loadProjects(turn)}>{turn.listError ? "Retry loading projects" : "Show more"}</Button> : null}
          </section> : null}
        </div>{turn.receivedAt ? <MessageTime value={turn.receivedAt} label="Received at" /> : null}</div></div> : null}
        {turn.error ? <p role="alert" className="ask-lisno-panel__notice">{turn.error}</p> : null}
        {!turn.response && !busy && index === turns.length - 1 ? <Button variant="quiet" size="compact" onClick={() => void send(turn)}>Retry answer</Button> : null}
      </div>) : null}
      {busy ? <p role="status" className="ask-lisno-panel__thinking">Lisno AI is checking your request…</p> : null}
    </div>
    <div className="ask-lisno-panel__footer">
    <AskLisnoQuickPrompts disabled={busy || historyAccess !== "ready"} onSelect={message => void send(undefined, undefined, message)} />
    <form className="ask-lisno-panel__composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="sr-only" htmlFor="ask-lisno-message">Your question</label>
      <div className="ask-lisno-panel__input-wrap"><textarea ref={composer} id="ask-lisno-message" value={historyAccess === "ready" ? draft : ""} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={1} readOnly={busy || historyAccess !== "ready"} placeholder="Ask about your project…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send(); } }} />
      <button type="submit" className="ask-lisno-panel__send" aria-label="Send" aria-busy={busy || undefined} disabled={busy || !draft.trim() || historyAccess !== "ready"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3" /></svg></button></div>
      <div className="ask-lisno-panel__actions"><Link to={historyAccess === "ready" && contextProjectId ? `/projects/${encodeURIComponent(contextProjectId)}/messages` : "/project-messages"} onClick={close}>Message your team</Link><small className="ask-lisno-panel__privacy-note">Private conversation</small></div>
    </form>
    </div>
  </section></OverlayPortal>;
}
