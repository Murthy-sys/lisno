import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { chatErrorMessage, projectChatApi } from "./projectChatApi";
import type { DailyCriticalTaskItem, DailyCriticalTasks } from "../../../../shared/chat/dailyCriticalTasks";
import "./dailyCriticalTasks.css";

export function DailyCriticalTasksPrompt() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const internal = hasFrontendPermission(auth.authorization ?? null, "chat.read") && Boolean(auth.user && auth.user.role !== "client");
  const key = ["daily-critical-tasks", auth.user?.id] as const;
  const digest = useQuery<DailyCriticalTasks | null>({
    queryKey: key,
    queryFn: ({ signal }) => projectChatApi.dailyCriticalTasks(signal),
    enabled: internal,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
  const acknowledge = useMutation({
    mutationFn: (localDate: string) => projectChatApi.acknowledgeDailyCriticalTasks(localDate),
    onSuccess: async () => {
      setManualOpen(false);
      await queryClient.invalidateQueries({ queryKey: key });
    }
  });
  if (!internal) return null;
  const list = digest.data;
  const requiresAcknowledgment = Boolean(list && !list.acknowledgedAt);
  const open = Boolean(list && (requiresAcknowledgment || manualOpen));

  async function openCurrentList() {
    if (opening) return;
    setOpening(true);
    try {
      // Recheck current authorization before showing a previously acknowledged list.
      const current = await digest.refetch();
      if (!current.isError && current.data) setManualOpen(true);
    } finally {
      setOpening(false);
    }
  }

  return <>
    {digest.isError ? <Button type="button" variant="quiet" size="compact" onClick={() => void digest.refetch()}>Retry critical tasks</Button>
      : list ? <Button type="button" variant="quiet" size="compact" busy={opening} onClick={() => void openCurrentList()} aria-label="View daily critical tasks">Critical tasks</Button> : null}
    {open && list ? <Dialog title="Daily critical tasks" eyebrow="5 PM team review" description={`Your critical actions and overdue assigned tasks for ${list.localDate}. Review this list and acknowledge that you have seen it.`} role={requiresAcknowledgment ? "alertdialog" : "dialog"} showCloseButton={!requiresAcknowledgment} busy={acknowledge.isPending} onClose={() => { if (!requiresAcknowledgment) setManualOpen(false); }}>
      <div className="daily-critical-tasks">
        {digest.isError ? <p role="alert">The task list may be out of date. <Button type="button" variant="quiet" onClick={() => void digest.refetch()}>Retry</Button></p> : null}
        {digest.isFetching ? <p role="status">Refreshing assigned tasks…</p> : null}
        {digest.isError || digest.isFetching ? null : list.items.length ? <ol className="daily-critical-tasks__list">{list.items.map((item) => <li key={`${item.kind}:${item.id}`}><span className="daily-critical-tasks__kind">{item.kind === "chat_action" ? "Critical chat action" : "Overdue workflow task"}</span><strong>{item.title}</strong><span>{item.projectName}</span><TaskDue item={item} />{item.kind === "chat_action" ? <Link to={`/projects/${encodeURIComponent(item.projectId)}/messages?message=${encodeURIComponent(item.messageId)}`}>Open conversation</Link> : null}</li>)}</ol>
          : <p role="status">No open critical chat actions or overdue assigned workflow tasks right now.</p>}
        {acknowledge.error ? <p role="alert">{chatErrorMessage(acknowledge.error)} <Button type="button" variant="quiet" onClick={() => void digest.refetch()}>Refresh list</Button></p> : null}
        <div className="daily-critical-tasks__actions">{requiresAcknowledgment ? <Button type="button" busy={acknowledge.isPending} disabled={digest.isError || digest.isFetching} onClick={() => acknowledge.mutate(list.localDate)}>I have reviewed this list</Button> : <Button type="button" onClick={() => setManualOpen(false)}>Close</Button>}</div>
      </div>
    </Dialog> : null}
  </>;
}

function TaskDue({ item }: { item: DailyCriticalTaskItem }) {
  const due = item.kind === "chat_action" ? item.dueDate : item.dueAt;
  return <span>Due <time dateTime={due}>{item.kind === "chat_action" ? due : new Date(due).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</time></span>;
}
