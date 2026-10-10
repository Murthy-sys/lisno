import { useMemo, useRef, useState } from "react";
import { useMatch } from "react-router-dom";
import { tokenStorage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { AskLisnoPanel } from "../ask-lisno/AskLisnoPanel";
import { LisnoChatMark } from "../messages/LisnoChatMark";

export function AskLisnoLauncher() {
  const auth = useAuth();
  const token = tokenStorage.get();
  const scope = useMemo(() => crypto.randomUUID(), [auth.user?.id, auth.status, token]);
  if (auth.status !== "authenticated" || auth.user?.role !== "client" || !hasFrontendPermission(auth.authorization, "ask_lisno.request")) return null;
  return <AskLisnoSession key={scope} scope={scope} />;
}

function AskLisnoSession({ scope }: { scope: string }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const projectId = useMatch("/client/projects/:projectId")?.params.projectId;
  return <>
    <button ref={launcher} className="ask-lisno-launcher" type="button" aria-label="Ask Lisno" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "ask-lisno-panel" : undefined} onClick={() => setOpen(current => !current)}>
      <span className="ask-lisno-launcher__icon"><LisnoChatMark /></span>
      <span><strong>Ask Lisno</strong><small>Private AI chat</small></span>
    </button>
    <AskLisnoPanel open={open} onClose={() => setOpen(false)} routeProjectId={projectId} scope={scope} returnFocusRef={launcher} />
  </>;
}
