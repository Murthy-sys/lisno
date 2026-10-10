import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { OverlayPortal } from "../../components/ui/overlay";
import { AssistantAnswerContent } from "../messages/ChatAssistantResult";
import { LisnoChatMark } from "../messages/LisnoChatMark";
import { askLisnoApi, type AskLisnoInput, type AskLisnoProjectList, type AskLisnoResponse } from "./askLisnoApi";
import "./askLisno.css";

interface Turn { id: string; message: string; response?: AskLisnoResponse; error?: string; choiceProjectId?: string; listError?: string; listChanged?: boolean }
const suggestions = ["Show my projects", "Project progress", "Expected timeline", "Add something to my estimate"];
const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
function failure(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return "The AI request limit has been reached. Please try again later.";
  return "Lisno AI could not answer right now. Try again or contact your project team.";
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

export function AskLisnoPanel({ open, onClose, routeProjectId, scope, returnFocusRef }: {
  open: boolean; onClose: () => void; routeProjectId?: string; scope: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
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
  const controller = useRef<AbortController | null>(null);
  const paging = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const verification = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);

  function stopPaging() { paging.current?.abort(); paging.current = null; setPagingId(null); }
  function stop() { generation.current += 1; controller.current?.abort(); controller.current = null; stopPaging(); verification.current?.abort(); verification.current = null; setBusy(false); setHistoryAccess("unchecked"); }
  function close() {
    stop(); onClose();
    if (!returnFocusRef.current?.closest("[inert]")) returnFocusRef.current?.focus();
  }
  useEffect(() => () => { generation.current += 1; controller.current?.abort(); paging.current?.abort(); verification.current?.abort(); }, []);
  useEffect(() => { stop(); setTurns([]); setContextProjectId(null); setDraft(""); setNotice(""); setIgnorePageHint(false); }, [scope]);
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

  async function send(retry?: Turn, choiceProjectId?: string, suggestion?: string) {
    const message = retry?.message ?? suggestion ?? draft.trim();
    if (!message || controller.current || historyAccess !== "ready") return;
    const choice = choiceProjectId ?? retry?.choiceProjectId;
    const turn: Turn = { id: retry?.id ?? crypto.randomUUID(), message, ...(choice ? { choiceProjectId: choice } : {}) };
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
      setTurns([...previous, { ...turn, response }]); setDraft("");
    } catch (error) {
      if (version !== generation.current || request.signal.aborted) return;
      if (denied(error)) {
        setTurns([]); setDraft(""); setNotice("This conversation is no longer available for your current access.");
        setContextProjectId(null); setIgnorePageHint(true);
      } else { setTurns([...previous, { ...turn, error: failure(error) }]); setDraft(message); }
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
  return <OverlayPortal><section ref={panel} id="ask-lisno-panel" role="dialog" aria-modal="false" aria-labelledby="ask-lisno-title" className="ask-lisno-panel" style={viewport} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented && !panel.current?.closest("[inert]")) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <header className="ask-lisno-panel__header"><div className="ask-lisno-panel__identity"><LisnoChatMark /><div><h2 id="ask-lisno-title">Ask Lisno</h2><p>Your Lisno AI assistant</p></div></div><button type="button" className="ask-lisno-panel__close" onClick={close} aria-label="Close Ask Lisno">×</button></header>
    <div className="ask-lisno-panel__conversation" ref={log} role="log" aria-label="Private conversation" aria-live="polite" aria-busy={busy || historyAccess === "checking"}>
      {turns.length === 0 && historyAccess === "ready" ? <div className="ask-lisno-panel__welcome"><img src="/lisno-logo.svg" alt="" width="110" height="30" /><h3>How can I help you today?</h3><p>Ask about your project, its timeline or a change you have in mind. Just mention the project name.</p><div className="ask-lisno-panel__suggestions">{suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => void send(undefined, undefined, suggestion)}>{suggestion}</button>)}</div></div> : null}
      {notice ? <p role="alert" className="ask-lisno-panel__notice">{notice}</p> : null}
      {historyAccess === "checking" || historyAccess === "unchecked" ? <p role="status">Checking access to your conversation…</p> : null}
      {historyAccess === "error" ? <div><p role="alert">Your conversation access could not be checked.</p><Button variant="quiet" size="compact" onClick={() => void verifyHistory()}>Retry conversation</Button></div> : null}
      {historyAccess === "ready" ? turns.map((turn, index) => <div key={turn.id} className="ask-lisno-panel__turn"><p className="ask-lisno-panel__question"><span className="sr-only">You: </span>{turn.message}</p>
        {turn.response ? <div className="ask-lisno-panel__answer"><span className="ask-lisno-panel__speaker"><LisnoChatMark /><span>Lisno AI{turn.response.resolution?.project ? <span className="ask-lisno-panel__project-name"> · {turn.response.resolution.project.name}</span> : null}</span></span>
          {turn.listChanged ? <p role="status">Your project list has changed. Refresh it to see the current projects.</p> : turn.response.resolution?.state === "clarification" ? <div className="ask-lisno-panel__clarification"><p>{turn.response.resolution.question ?? "Which project would you like to discuss?"}</p><div>{turn.response.resolution.choices.map(choice => <button key={choice.id} type="button" disabled={busy || index !== turns.length - 1} onClick={() => void send(turn, choice.id)}>{choice.name}{choice.detail ? <small>{choice.detail}</small> : null}</button>)}</div></div> : <AssistantAnswerContent result={{ ...turn.response.answer, checkedAt: turn.response.checkedAt, stale: false, commercialAccess: turn.response.answer.commercial ? "allowed" : "none" }} />}
          {turn.response.projectList ? <section className="ask-lisno-panel__projects" aria-label="Your projects" aria-busy={pagingId === turn.id}>
            {turn.response.projectList.items.length ? <ul>{directoryRows(turn.response.projectList.items).map(project => <li key={project.id}><div><strong>{project.name}</strong>{project.detail ? <small>{project.detail}</small> : null}{project.reference ? <small>{project.reference}</small> : null}</div><button type="button" disabled={busy} aria-label={`View progress for ${project.name}${project.detail ? `, ${project.detail}` : ""}${project.reference ? `, ${project.reference}` : ""}`} onClick={() => void send(undefined, project.id, `Show progress for ${project.name}`)}>View progress</button></li>)}</ul> : null}
            {turn.listError ? <p role="alert">{turn.listError}</p> : null}
            {pagingId === turn.id ? <p role="status">Loading projects…</p> : null}
            {turn.listChanged ? <Button variant="quiet" size="compact" disabled={busy || pagingId !== null} onClick={() => void loadProjects(turn, true)}>Refresh projects</Button> : turn.response.projectList.nextOffset !== null ? <Button variant="quiet" size="compact" disabled={busy || pagingId !== null} onClick={() => void loadProjects(turn)}>{turn.listError ? "Retry loading projects" : "Show more"}</Button> : null}
          </section> : null}
        </div> : null}
        {turn.error ? <p role="alert" className="ask-lisno-panel__notice">{turn.error}</p> : null}
        {!turn.response && !busy && index === turns.length - 1 ? <Button variant="quiet" size="compact" onClick={() => void send(turn)}>Retry answer</Button> : null}
      </div>) : null}
      {busy ? <p role="status" className="ask-lisno-panel__thinking">Lisno AI is checking your request…</p> : null}
    </div>
    <form className="ask-lisno-panel__composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label className="sr-only" htmlFor="ask-lisno-message">Your question</label>
      <textarea ref={composer} id="ask-lisno-message" value={historyAccess === "ready" ? draft : ""} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={2} readOnly={busy || historyAccess !== "ready"} placeholder="Ask about your project…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send(); } }} />
      <div className="ask-lisno-panel__actions"><Link to={historyAccess === "ready" && contextProjectId ? `/projects/${encodeURIComponent(contextProjectId)}/messages` : "/project-messages"} onClick={close}>Message your team</Link><Button type="submit" size="compact" busy={busy} busyLabel="Thinking…" disabled={!draft.trim() || historyAccess !== "ready"}>Send</Button></div>
    </form>
  </section></OverlayPortal>;
}
