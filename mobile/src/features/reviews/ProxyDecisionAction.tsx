import { useState } from "react";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, useNativeWorkspace } from "../admin/nativeWorkspace";
import { ReviewDetail } from "./ReviewQueueWorkspace";
import type { ReviewKind } from "./reviewModel";

/** Legacy list adapter: decisions always open the typed immutable review first. */
export function ProxyDecisionAction({ record, queue }: { record: Record<string, unknown>; queue: ReviewKind }) {
  const runtime = useConfiguredRuntime(); const roundId = typeof record.id === "string" ? record.id : null;
  if (!roundId || runtime.session.status !== "authenticated" || !runtime.session.session) return null;
  return <ReviewLauncher roundId={roundId} kind={queue} session={runtime.session.session} />;
}
function ReviewLauncher({ roundId, kind, session }: { roundId: string; kind: ReviewKind; session: AuthenticatedSession }) {
  const c = useNativeWorkspace(session, kind === "estimate" ? "estimate-responses" : "design-plans"); const [open, setOpen] = useState(false);
  return <><Button label={open ? "Close submitted review" : "Open submitted review"} variant="secondary" onPress={() => c.navigate(() => setOpen(!open))} />{open ? <ReviewDetail key={`${c.scope}:${roundId}`} context={c} kind={kind} roundId={roundId} /> : null}</>;
}
