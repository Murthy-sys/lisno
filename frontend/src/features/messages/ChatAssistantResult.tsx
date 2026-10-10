import { useAuth } from "../../auth/AuthProvider";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import type { AssistantCommercialSnapshot, AssistantSourceReference, ChatAssistantMessageState, ChatAssistantResult as AssistantResult } from "./projectChatAssistantTypes";
import type { ChatMessage } from "./projectChatTypes";
import { useChatAssistantRequest, useChatAssistantResult } from "./useChatAssistant";
import "./projectChatAssistant.css";

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const mode = { pmc: "PMC", sub_vendor: "Sub-Vendor", in_house: "In-house" };
function checkedTime(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

function Source({ source }: { source: AssistantSourceReference }) {
  // Tool-provided content is text, never HTML. Only application-relative links are navigable.
  const href = source.href && /^\/(?!\/)[^\\\s]*$/.test(source.href) ? source.href : null;
  return href ? <Link to={href} className="project-chat-assistant__source">{source.label}</Link> : <span className="project-chat-assistant__source">{source.label}</span>;
}

function Price({ price }: { price: AssistantCommercialSnapshot }) {
  const missing = [...new Set([...price.missingInputs, ...price.lines.flatMap(line => line.missingInputs)])];
  return <section className="project-chat-assistant__price" aria-label="Approximate addition charges">
    <h3>Approximate addition charges</h3>
    <p className="project-chat-assistant__note">{price.state === "complete" ? "Estimate preview" : "Incomplete estimate preview"}. Final scope and charges require team confirmation. Your approved estimate is unchanged.</p>
    <ul className="project-chat-assistant__lines">{price.lines.map((line, index) => <li key={`${line.mainLineId}:${line.roomId}:${index}`}>
      <div><strong>{line.name}</strong><span>{line.quantity === null ? "Quantity needed" : `${line.quantity} ${line.uom}`} · {mode[line.pricingMode]}{line.optional ? " · Optional addition" : ""}</span></div>
      <strong>{line.amountPaise === null ? "Not priced" : money(line.amountPaise)}</strong>
    </li>)}</ul>
    <dl className="project-chat-assistant__totals">
      {price.subtotalPaise !== null ? <div><dt>Additions before GST</dt><dd>{money(price.subtotalPaise)}</dd></div> : null}
      {price.gstPaise !== null ? <div><dt>GST ({price.gstRateBps / 100}%)</dt><dd>{money(price.gstPaise)}</dd></div> : null}
      {price.totalPaise !== null ? <div><dt>Approximate additions total</dt><dd>{money(price.totalPaise)}</dd></div> : null}
      {price.optionalSubtotalPaise !== null ? <div><dt>Optional additions before GST</dt><dd>{money(price.optionalSubtotalPaise)}</dd></div> : null}
      {price.approvedBaselinePaise !== null ? <div><dt>Approved estimate</dt><dd>{money(price.approvedBaselinePaise)}</dd></div> : null}
      {price.hypotheticalTotalPaise !== null ? <div><dt>Potential project total</dt><dd>{money(price.hypotheticalTotalPaise)}</dd></div> : null}
    </dl>
    {price.assumptions.length ? <div><h4>Assumptions</h4><ul>{price.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
    {missing.length ? <div><h4>Details needed</h4><ul>{missing.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
  </section>;
}

export function ChatAssistantResult({ projectId, resultId }: { projectId: string; resultId: string }) {
  const query = useChatAssistantResult(projectId, resultId);
  if (!query.enabled) return null;
  if (query.isPending || query.isFetching) return <p className="project-chat-assistant__note" role="status">Checking current access to the AI answer…</p>;
  if (query.denied) return <p className="project-chat-assistant__note" role="status">This AI answer is unavailable for your current access.</p>;
  if (query.isError || !query.result) return <div className="project-chat-assistant__note" role="alert">The AI answer could not be loaded. <Button variant="quiet" size="compact" onClick={() => void query.refetch()}>Retry answer</Button></div>;
  return <AssistantAnswerContent result={query.result} />;
}

export function AssistantAnswerContent({ result }: { result: Omit<AssistantResult, "id" | "projectId" | "messageId"> }) {
  const narrative = result.narrative?.filter(paragraph => paragraph.text.trim()) ?? [];
  const hasDetails = result.facts.length > 0 || result.candidates.length > 0 || result.missingInputs.length > 0 || result.stale || result.commercialAccess === "restricted" || (result.commercialAccess === "allowed" && result.commercial !== null);
  const facts = result.facts.length ? <dl className="project-chat-assistant__facts">{result.facts.map(fact => <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}<Source source={fact.source} /></dd></div>)}</dl> : null;
  return <section className="project-chat-assistant__result" aria-label="Lisno AI answer">
    <h2 className="sr-only">Lisno AI answer</h2>
    {narrative.length ? <div className="project-chat-assistant__narrative">{narrative.map((paragraph, index) => <p key={index}>{paragraph.text}</p>)}</div> : null}
    {result.stale ? <p role="status" className="project-chat-assistant__notice">Project or Configuration data has changed since this answer. Use the options menu on your original message to refresh the AI reply before relying on these details.</p> : null}
    {narrative.length ? hasDetails ? <details className="project-chat-assistant__details"><summary>Sources and details</summary>{facts}<p className="project-chat-assistant__note">Checked <time dateTime={result.checkedAt}>{checkedTime(result.checkedAt)}</time> India time</p></details> : null : <>{facts}<p className="project-chat-assistant__note">Checked <time dateTime={result.checkedAt}>{checkedTime(result.checkedAt)}</time> India time</p></>}
    {result.candidates.length ? <section aria-label="Matching Main Lines"><h3>Matching Main Lines</h3><ul>{result.candidates.map(candidate => <li key={candidate.mainLineId}><strong>{candidate.name}</strong><span className="project-chat-assistant__note">{candidate.basketName}{candidate.subBasketName ? ` · ${candidate.subBasketName}` : ""} · {candidate.uom.name}{!candidate.available ? " · Currently unavailable" : ""}</span></li>)}</ul></section> : null}
    {result.missingInputs.length ? <section aria-label="Details needed"><h3>Details needed</h3><ul>{result.missingInputs.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="project-chat-assistant__note">Reply in this conversation with these details.</p></section> : null}
    {result.commercialAccess === "allowed" && result.commercial ? <Price price={result.commercial} /> : null}
    {result.commercialAccess === "restricted" ? <p className="project-chat-assistant__note">Price details are restricted to authorised project users.</p> : null}
    {!narrative.length && (result.kind === "handoff" || result.kind === "no_answer") ? <p className="project-chat-assistant__note">The project team needs to confirm this request.</p> : null}
  </section>;
}

function stateLabel(state: ChatAssistantMessageState) {
  switch (state.status) {
    case "waiting_for_human": return "Lisno AI is waiting for the project team. It can respond after 2 minutes without a human reply.";
    case "ready": case "leased": return "Lisno AI is checking your project.";
    case "failed": return "Lisno AI is temporarily unavailable. Your message is still with the project team.";
    case "no_answer": return "Lisno AI has replied. See its message for details.";
    case "suppressed": return "No automatic AI answer is pending for this message.";
    default: return null;
  }
}

export function ChatAssistantMessage({ projectId, message }: { projectId: string; message: ChatMessage }) {
  const { user } = useAuth();
  const action = useChatAssistantRequest(projectId, message);
  const state = message.assistant;
  if (!state) return null;
  if (message.author.kind === "service") return state.resultId ? <ChatAssistantResult projectId={projectId} resultId={state.resultId} /> : null;
  if (user?.role === "client") {
    if (state.status === "leased") return <p className="project-chat-assistant__note" role="status">Lisno AI is replying…</p>;
    if (state.status !== "failed") return null;
    return <div className="project-chat-assistant__failure"><p role="status">Lisno AI couldn’t reply. Your message is with the team.</p>{action.canRequest ? <Button variant="quiet" size="compact" busy={action.busy} onClick={action.request}>Retry AI reply</Button> : null}{action.error ? <p role="alert">{action.error}</p> : null}</div>;
  }
  const label = stateLabel(state);
  return <div className="project-chat-assistant__state">
    {state.routing === "notified" && state.notified ? <p>Alert sent to {state.notified.name}.</p> : null}
    {state.routing === "unroutable" ? <p>No responsible team member is currently available for this request.</p> : null}
    {label ? <p role="status">{label}</p> : null}
    {action.canRequest ? <Button variant="quiet" size="compact" busy={action.busy} onClick={action.request}>{state.resultId ? "Recalculate / refresh AI answer" : "Request AI answer"}</Button> : null}
    {action.error ? <p role="alert">{action.error}</p> : null}
  </div>;
}
