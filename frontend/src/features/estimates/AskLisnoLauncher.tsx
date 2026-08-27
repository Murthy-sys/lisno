import { BotMessageSquare } from "lucide-react";

export function AskLisnoLauncher() {
  return (
    <button className="ask-lisno-launcher" type="button" aria-label="Ask Lisno" disabled>
      <span className="ask-lisno-launcher__icon"><BotMessageSquare aria-hidden="true" /></span>
      <span><strong>Ask Lisno</strong><small>Coming soon</small></span>
    </button>
  );
}
