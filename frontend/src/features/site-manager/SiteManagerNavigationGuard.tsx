import { useContext, useEffect, type RefObject } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

export function SiteManagerNavigationGuard({ dirty, busy, allowedClose }: { dirty: boolean; busy: boolean; allowedClose: RefObject<boolean> }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!dirty && !busy) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty, busy]);
  return dataRouter ? <RouterGuard dirty={dirty} busy={busy} allowedClose={allowedClose} /> : null;
}

function RouterGuard({ dirty, busy, allowedClose }: { dirty: boolean; busy: boolean; allowedClose: RefObject<boolean> }) {
  // Filters and assignment disclosures replace the current URL; cross-project
  // navigation must preserve a pending schedule, verification or handoff draft.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowedClose.current) { allowedClose.current = false; return false; }
    const assignmentChanged = new URLSearchParams(currentLocation.search).get("assignment") !== new URLSearchParams(nextLocation.search).get("assignment");
    return (dirty || busy) && (currentLocation.pathname !== nextLocation.pathname || assignmentChanged);
  });
  if (blocker.state !== "blocked") return null;
  return <Dialog title="Leave project with unsaved changes?" eyebrow="Unsaved changes" description="Your pending changes will be lost if you leave this project." role="alertdialog" busy={busy} onClose={() => blocker.reset()}><div className="modal__actions"><Button variant="secondary" data-dialog-initial-focus disabled={busy} onClick={() => blocker.reset()}>Keep editing</Button><Button variant="destructive" disabled={busy} onClick={() => blocker.proceed()}>Discard and leave</Button></div></Dialog>;
}
