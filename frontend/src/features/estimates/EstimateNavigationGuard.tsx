import { useContext, useEffect, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

interface Props {
  dirty: boolean;
  busy: boolean;
  saveDisabled: boolean;
  onSave: () => Promise<boolean>;
}

/** Same protection for staff and client working estimates; issued reviews are separate. */
export function EstimateNavigationGuard(props: Props) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!props.dirty && !props.busy) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [props.dirty, props.busy]);
  return dataRouter ? <RouteGuard {...props} /> : null;
}

function RouteGuard({ dirty, busy, saveDisabled, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || busy) &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  if (blocker.state !== "blocked") return null;
  const locked = busy || saving;
  return <Dialog title="Leave estimate with unsaved changes?" eyebrow="Unsaved estimate" role="alertdialog"
    description="Save your changes before leaving, or discard them." busy={locked} onClose={() => { setFailed(false); blocker.reset(); }}>
    {failed ? <p role="alert" className="ui-dialog__body">The save could not be confirmed. Keep editing to review the estimate before leaving.</p> : null}
    <div className="ui-dialog__actions">
      <Button variant="secondary" disabled={locked} onClick={() => { setFailed(false); blocker.reset(); }}>Keep editing</Button>
      <Button variant="secondary" disabled={locked} onClick={() => blocker.proceed()}>Discard and leave</Button>
      <Button disabled={saveDisabled || locked} busy={saving} onClick={async () => {
        setSaving(true); setFailed(false);
        try { if (await onSave()) blocker.proceed(); else setFailed(true); }
        catch { setFailed(true); }
        finally { setSaving(false); }
      }}>Save and leave</Button>
    </div>
  </Dialog>;
}
