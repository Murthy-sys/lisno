import { useEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { lifecycleApi, type LifecycleTab } from "./lifecycleApi";
import { lifecycleDenied, lifecycleTabLabels, ReadState, useLifecycleQuery, type LifecyclePanelProps } from "./LifecycleShared";
import { PaymentsPanel } from "./PaymentsPanel";
import { ProgressPanel } from "./ProgressPanel";
import { HandoverPanel } from "./HandoverPanel";
import { SignoffPanel } from "./SignoffPanel";
import "./lifecycle.css";

const tabs: LifecycleTab[] = ["vendors", "payments", "progress", "handover", "signoff"];
export function LifecycleWorkspace({ children, ...props }: LifecyclePanelProps & { children?: ReactNode }) {
  const [params, setParams] = useSearchParams(); const requested = params.get("tab"); const active = tabs.includes(requested as LifecycleTab) ? requested as LifecycleTab : "vendors";
  const visited = useRef(new Set<LifecycleTab>(["vendors"])); visited.current.add(active);
  const query = useLifecycleQuery(props, "summary", () => lifecycleApi(props.projectId, props.audience).summary());
  const visibleSummary = lifecycleDenied(query.error) ? undefined : query.data;
  const strip = useRef<HTMLElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const viewport = strip.current;
    const selected = buttons.current[tabs.indexOf(active)];
    if (!viewport || !selected) return;
    function revealSelectedTab() {
      if (!viewport || !selected) return;
      const bounds = viewport.getBoundingClientRect();
      const tabBounds = selected.getBoundingClientRect();
      if (tabBounds.left < bounds.left) viewport.scrollLeft += tabBounds.left - bounds.left;
      else if (tabBounds.right > bounds.right) viewport.scrollLeft += tabBounds.right - bounds.right;
    }
    revealSelectedTab();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(revealSelectedTab);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, [active]);
  function choose(tab: LifecycleTab) { setParams(current => { const next = new URLSearchParams(current); next.set("tab", tab); next.delete("entity"); return next; }, { state: { preserveFocus: true } }); }
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return; event.preventDefault(); choose(tabs[next]!); buttons.current[next]?.focus();
  }
  return <div className="lc-workspace"><nav ref={strip} className="lc-tab-scroll" aria-label="Project procurement stages"><div className="lc-tabs" role="tablist" aria-label="Project procurement lifecycle">{tabs.map((tab, index) => {
    const attention = visibleSummary?.attention;
    const count = tab === "payments" ? attention?.overduePayments : tab === "progress" ? attention?.progressActions : tab === "handover" ? attention?.handoverActions : tab === "signoff" ? attention?.signoffBlockers : visibleSummary?.blockers.filter(blocker => blocker.tab === tab).length;
    return <button key={tab} ref={element => { buttons.current[index] = element; }} id={`lc-tab-${tab}`} role="tab" type="button" aria-selected={active === tab} aria-controls={`lc-panel-${tab}`} tabIndex={active === tab ? 0 : -1} onClick={() => choose(tab)} onKeyDown={event => keydown(event, index)}><span className="lc-tab-step" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{lifecycleTabLabels[tab]}{count != null && count > 0 ? <span className="lc-tab-count" aria-label={tab === "payments" ? `${count} overdue payment${count === 1 ? "" : "s"}` : `${count} action${count === 1 ? "" : "s"} needed`}>{count}</span> : null}</button>;
  })}</div></nav>
    {visibleSummary?.availability === "legacy_completed" ? <p className="lc-message">This project was completed before lifecycle tracking. Its original closeout is retained; earlier inspections and payments have not been invented.</p> : null}
    {tabs.map(tab => <section key={tab} id={`lc-panel-${tab}`} role="tabpanel" aria-labelledby={`lc-tab-${tab}`} hidden={active !== tab} tabIndex={0}>
      {tab === "vendors" ? children ?? <div className="lc-panel"><h2>Bids & vendor appointment</h2><p>Vendor appointment and issued work orders remain in the existing Procurement workspace.</p></div> : visited.current.has(tab) ? <ReadState query={query}>{(summary, stale) => {
        const panelProps = { ...props, disabled: props.disabled || stale };
        if (tab === "payments") return <PaymentsPanel projectId={props.projectId} actorId={props.actorId} audience={props.audience ?? "procurement"} disabled={panelProps.disabled} />;
        if (tab === "progress") return <ProgressPanel {...panelProps} summary={summary} />;
        if (tab === "handover") return <HandoverPanel {...panelProps} summary={summary} />;
        return <SignoffPanel {...panelProps} />;
      }}</ReadState> : null}
    </section>)}
  </div>;
}
