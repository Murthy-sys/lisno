import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { consumeLoginReview, getLoginReviewState, isLoginReviewSessionCurrent, subscribeLoginReviewSession, type LoginReviewSession } from "../../auth/loginReviewSession";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { chatErrorMessage, projectChatApi } from "./projectChatApi";
import type { CurrentCriticalTaskReview, DailyCriticalTaskItem } from "../../../../shared/chat/dailyCriticalTasks";
import "./dailyCriticalTasks.css";

export function DailyCriticalTasksPrompt() {
  const auth = useAuth();
  const session = auth.reviewSession;
  const internal = auth.status === "authenticated" && hasFrontendPermission(auth.authorization ?? null, "chat.read") && Boolean(auth.user && auth.user.role !== "client");
  const state = useSyncExternalStore(subscribeLoginReviewSession, () => session ? getLoginReviewState(session) : "stale", () => "stale");
  const eligible = internal && Boolean(session && session.userId === auth.user?.id) && state !== "stale";
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const stillEligible = useCallback(() => eligibleRef.current, []);
  if (!eligible || !session) return null;
  // A consumed marker must not unmount its own winning request before it opens.
  return <SessionCriticalTasksPrompt key={`${session.userId}:${session.id}`} sessionId={session.id} userId={session.userId} stillEligible={stillEligible} />;
}

function SessionCriticalTasksPrompt({ sessionId, userId, stillEligible }: { sessionId: string; userId: string; stillEligible: () => boolean }) {
  const queryClient = useQueryClient();
  const session = useMemo<LoginReviewSession>(() => ({ id: sessionId, userId }), [sessionId, userId]);
  const key = useMemo(() => ["daily-critical-tasks", "current", userId, sessionId] as const, [userId, sessionId]);
  const [review, setReview] = useState<{ data: CurrentCriticalTaskReview; automatic: boolean } | null>(null);
  const [opening, setOpening] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const [ackError, setAckError] = useState<unknown>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const acknowledgingRef = useRef(false);
  const isCurrent = useCallback(() => mountedRef.current && stillEligible() && isLoginReviewSessionCurrent(session), [session, stillEligible]);

  const readCurrent = useCallback(async (automatic: boolean) => {
    if (!isCurrent()) return;
    const operation = ++operationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const valid = () => isCurrent() && operationRef.current === operation && !controller.signal.aborted;
    setOpening(true);
    setReadError(null);
    setAckError(null);
    setReview(null);
    try {
      // No enabled observer: invalidation, focus and old receipt events cannot
      // re-open the review. Every explicit read goes back to authorization.
      const current = await queryClient.fetchQuery({
        queryKey: key,
        staleTime: 0,
        retry: false,
        queryFn: async ({ signal }) => {
          const abort = () => controller.abort();
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) controller.abort();
          try { return await projectChatApi.currentCriticalTaskReview(controller.signal); }
          finally { signal.removeEventListener("abort", abort); }
        }
      });
      if (!valid()) return;
      const won = await consumeLoginReview(session, valid);
      if (!valid()) return;
      if ((!automatic || won) && (!automatic || current.items.length > 0)) {
        setReview({ data: current, automatic });
      }
    } catch (error) {
      if (!valid()) return;
      queryClient.removeQueries({ queryKey: key, exact: true });
      setReadError(error);
    } finally {
      if (valid()) setOpening(false);
    }
  }, [isCurrent, key, queryClient, session]);

  useEffect(() => {
    mountedRef.current = true;
    if (getLoginReviewState(session) === "pending") void readCurrent(true);
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      controllerRef.current?.abort();
      void queryClient.cancelQueries({ queryKey: key, exact: true });
    };
  }, [key, queryClient, readCurrent, session]);

  async function acknowledgeReview() {
    if (!review || !isCurrent() || acknowledgingRef.current) return;
    const receipt = review.data.receipt;
    if (!receipt || receipt.acknowledgedAt) {
      setReview(null);
      return;
    }
    acknowledgingRef.current = true;
    setAcknowledging(true);
    setAckError(null);
    const operation = ++operationRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const valid = () => isCurrent() && operationRef.current === operation && !controller.signal.aborted;
    try {
      const acknowledged = await projectChatApi.acknowledgeDailyCriticalTasks(receipt.localDate, controller.signal);
      if (!valid()) return;
      queryClient.setQueryData<CurrentCriticalTaskReview>(key, current => current?.receipt?.localDate === acknowledged.localDate
        ? { ...current, receipt: acknowledged } : current);
      setReview(null);
      // Keep any legacy digest consumer current without fetching another
      // chronological receipt for this prompt.
      void queryClient.invalidateQueries({ queryKey: ["daily-critical-tasks", userId] });
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        queryClient.removeQueries({ queryKey: key, exact: true });
        setReview(null);
        setReadError(error);
      } else {
        setAckError(error);
      }
    } finally {
      acknowledgingRef.current = false;
      if (valid()) setAcknowledging(false);
    }
  }

  const list = review?.data;
  const requiresAcknowledgment = Boolean(list?.receipt && !list.receipt.acknowledgedAt);
  const close = () => { if (!acknowledging && !requiresAcknowledgment) setReview(null); };
  const checkedAt = list ? new Date(list.checkedAt).toLocaleString("en-IN", { timeZone: list.timezone, dateStyle: "medium", timeStyle: "short" }) : "";
  return <>
    <Button ref={triggerRef} type="button" variant="quiet" size="compact" busy={opening} onClick={() => void readCurrent(false)} aria-label={readError ? "Retry critical tasks" : "View daily critical tasks"}>{readError ? "Retry critical tasks" : "Critical tasks"}</Button>
    {readError ? <span role="alert">{chatErrorMessage(readError)}</span> : null}
    {review && list ? <Dialog title="Daily critical tasks" eyebrow="Current task review" description={`Your open critical actions and overdue assigned tasks. Checked ${checkedAt}. Reviewing this list does not complete these tasks.`} role={review.automatic || requiresAcknowledgment ? "alertdialog" : "dialog"} showCloseButton={!requiresAcknowledgment} busy={acknowledging} onClose={close} returnFocusRef={triggerRef}>
      <div className="daily-critical-tasks">
        {list.items.length ? <ol className="daily-critical-tasks__list">{list.items.map(item => <li key={`${item.kind}:${item.id}`}><span className="daily-critical-tasks__kind">{item.kind === "chat_action" ? "Critical chat action" : "Overdue workflow task"}</span><strong>{item.title}</strong><span>{item.projectName}</span><TaskDue item={item} />{item.kind === "chat_action" ? <Link to={`/projects/${encodeURIComponent(item.projectId)}/messages?message=${encodeURIComponent(item.messageId)}`}>Open conversation</Link> : null}</li>)}</ol>
          : <p role="status">No open critical chat actions or overdue assigned workflow tasks right now.</p>}
        {ackError ? <p role="alert">{chatErrorMessage(ackError)} Please try again.</p> : null}
        <div className="daily-critical-tasks__actions"><Button type="button" busy={acknowledging} onClick={() => void acknowledgeReview()}>I have reviewed this list</Button></div>
      </div>
    </Dialog> : null}
  </>;
}

function TaskDue({ item }: { item: DailyCriticalTaskItem }) {
  const due = item.kind === "chat_action" ? item.dueDate : item.dueAt;
  return <span>Due <time dateTime={due}>{item.kind === "chat_action" ? due : new Date(due).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</time></span>;
}
