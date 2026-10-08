import { ProjectChatNavigation } from "../messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { LeadActivityType, LeadStage } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { AsyncState } from "../../components/ui/AsyncState";
import { ContactAndEstimateCard } from "./ContactAndEstimateCard";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import "../../styles/estimator-dashboard.css";
import "./estimationProgress.css";
import { addLeadActivity, getLead, getLeadActivities, leadKeys, updateLead } from "./leadsApi";

const labels: Record<LeadStage, string> = { new_lead: "New lead", contacted: "Contacted", site_visit: "Site visit", design_meeting: "Design meeting", estimate_in_progress: "Estimate in progress", estimate_sent: "Estimate sent", negotiation: "Negotiation", won: "Won", lost: "Lost" };
const estimateStartedStages: LeadStage[] = ["estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"];
export function LeadDetail() {
  const { leadId = "" } = useParams(); const navigate = useNavigate(); const client = useQueryClient(); const [note, setNote] = useState(""); const [type, setType] = useState<LeadActivityType>("note");
  const [summaryContainer, setSummaryContainer] = useState<HTMLDivElement | null>(null);
  const summaryRef = useCallback((element: HTMLDivElement | null) => setSummaryContainer(element), []);
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId) }); const activities = useQuery({ queryKey: leadKeys.activities(leadId), queryFn: () => getLeadActivities(leadId) });
  const refresh = async () => { await client.invalidateQueries({ queryKey: leadKeys.all }); await client.invalidateQueries({ queryKey: leadKeys.detail(leadId) }); await client.invalidateQueries({ queryKey: leadKeys.activities(leadId) }); };
  const stage = useMutation({ mutationFn: (value: LeadStage) => updateLead(leadId, { stage: value }), onSuccess: refresh });
  const startEstimate = useMutation({ mutationFn: () => updateLead(leadId, { stage: "estimate_in_progress" }), onSuccess: async () => { await refresh(); navigate(`/estimator-sales/leads/${leadId}/estimate`); } });
  const activity = useMutation({ mutationFn: () => addLeadActivity(leadId, { type, note, occurredAt: new Date().toISOString() }), onSuccess: async () => { setNote(""); await refresh(); } });
  if (lead.isPending || activities.isPending) return <AsyncState state="loading" message="Loading lead details…" />;
  if (lead.isError || activities.isError) return <AsyncState state="error" message="We couldn't load this lead." actionLabel="Try again" onAction={() => { void lead.refetch(); void activities.refetch(); }} />;
  const item = lead.data;
  const isEstimateProgress = item.stage === "estimate_in_progress";
  const stageControl = (
    <Field id="lead-detail-stage" label="Lead stage">
      {(props) => (
        <Select {...props} disabled={stage.isPending} value={item.stage} onChange={(event) => stage.mutate(event.target.value as LeadStage)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      )}
    </Field>
  );
  const workflow = item.projectId ? (
    <ProjectWorkflowPanel key="workflow" projectId={item.projectId} showInitialPayment={item.stage !== "estimate_in_progress"} />
  ) : null;
  const content = (
    <div key="content" className="lead-detail__grid">
      <ContactAndEstimateCard
        phone={item.clientMobile}
        email={item.clientEmail}
        nextAction={item.nextAction}
        buttonLabel={startEstimate.isPending ? "Opening…" : estimateStartedStages.includes(item.stage) ? "Continue estimate" : "Start estimate"}
        onContinue={() => startEstimate.mutate()}
        buttonDisabled={startEstimate.isPending}
        presentation={isEstimateProgress ? "estimate-progress" : "default"}
      />
      {!isEstimateProgress ? <section>
        <h2><MessageSquare aria-hidden="true" size={18} /> Follow-ups</h2>
        <form onSubmit={(event) => { event.preventDefault(); if (note.trim()) activity.mutate(); }}>
          <Field id="lead-activity-type" label="Activity type">
            {(props) => <Select {...props} disabled={activity.isPending} value={type} onChange={(event) => setType(event.target.value as LeadActivityType)}>{["call", "whatsapp", "meeting", "email", "note"].map((value) => <option key={value}>{value}</option>)}</Select>}
          </Field>
          <Field id="lead-follow-up" label="Follow-up note">
            {(props) => <Textarea {...props} disabled={activity.isPending} value={note} onChange={(event) => setNote(event.target.value)} />}
          </Field>
          <div className="lead-follow-up__actions"><Button type="submit" disabled={activity.isPending || !note.trim()}>{activity.isPending ? "Saving…" : "Add follow-up"}</Button></div>
        </form>
        {activity.isError ? <p role="alert">Follow-up could not be saved.</p> : null}
        {!activities.data.items.length ? <p className="lead-follow-up__empty">No follow-ups recorded.</p> : null}
        <ol className="lead-timeline">{activities.data.items.map((entry) => <li key={entry.id}><strong>{entry.type}</strong><span>{entry.note}</span><small>{new Date(entry.occurredAt).toLocaleString()}</small></li>)}</ol>
      </section> : null}
    </div>
  );

  return (
    <section className={`lead-detail estimator-dashboard${isEstimateProgress ? " lead-detail--estimate-progress" : ""}`} aria-labelledby="lead-detail-title">
      <Link to="/estimator-sales" className="lead-detail__back-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        All leads
      </Link>
      {isEstimateProgress ? (
        <header className="estimation-progress__header">
          <div className="estimation-progress__identity">
            <p className="estimation-progress__eyebrow">{labels[item.stage]}</p>
            <div className="estimation-progress__title-row">
              <h1 id="lead-detail-title">{item.projectName}</h1>
              {item.propertyType ? <span className="estimation-progress__property">{item.propertyType}</span> : null}
            </div>
            <ul className="estimation-progress__contacts" aria-label="Client contact details">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3H4Z" /></svg>
                <span>{item.clientName}</span>
              </li>
              {item.clientMobile ? <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3-1 4C10 22 2 14 3 4l4-1Z" /></svg>
                <a href={`tel:${item.clientMobile}`}>{item.clientMobile}</a>
              </li> : null}
              {item.clientEmail ? <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="1" /><path d="m2 5 10 8L22 5" /></svg>
                <a href={`mailto:${item.clientEmail}`}>{item.clientEmail}</a>
              </li> : null}
            </ul>
            {item.location ? <p className="estimation-progress__location">{item.location}</p> : null}
          </div>
          <div className="estimation-progress__header-controls">
            {stageControl}
            {item.projectId ? <div ref={summaryRef} className="estimation-progress__critical" /> : null}
          </div>
        </header>
      ) : (
        <header className="workspace-header">
          <div><p className="eyebrow">{labels[item.stage]}</p><h1 id="lead-detail-title">{item.clientName}</h1><p>{item.projectName} · {item.propertyType} · {item.location}</p></div>
          {stageControl}
        </header>
      )}
      {item.projectId ? (
        <ProjectChatNavigation
          projectId={item.projectId}
          overviewTo={`/estimator-sales/leads/${leadId}`}
          overviewLabel="Lead"
          summaryContainer={isEstimateProgress ? summaryContainer : undefined}
          presentation={isEstimateProgress ? "estimate-progress" : "default"}
        />
      ) : null}
      {stage.isError || startEstimate.isError ? <p role="alert">The lead could not be updated. Try again.</p> : null}
      {isEstimateProgress ? [content, workflow] : [workflow, content]}
    </section>
  );
}
