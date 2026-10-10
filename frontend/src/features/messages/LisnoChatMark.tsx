import { useState } from "react";
import "./LisnoChatMark.css";

/** Decorative brand artwork; the adjacent title supplies the assistant's name. */
export function LisnoChatMark({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className={`lisno-chat-mark${className ? ` ${className}` : ""}`} src="/lisno-chat-mark.svg" width={24} height={24} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
}
