import { ProjectChatNavigation } from "../messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useState } from "react";
import type { LeadStage } from "../../api/types";
import { Field, Select } from "../../components/ui/Field";
import { AsyncState } from "../../components/ui/AsyncState";
import { ContactAndEstimateCard } from "./ContactAndEstimateCard";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import "../../styles/estimator-dashboard.css";
import "./estimationProgress.css";
import { getLead, leadKeys, updateLead } from "./leadsApi";

const labels: Record<LeadStage, string> = { new_lead: "New lead", contacted: "Contacted", site_visit: "Site visit", design_meeting: "Design meeting", estimate_in_progress: "Estimate in progress", estimate_sent: "Estimate sent", negotiation: "Negotiation", won: "Won", lost: "Lost" };
const estimateStartedStages: LeadStage[] = ["estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"];
export function LeadDetail() {
  const { leadId = "" } = useParams();
  return <LeadDetailContent key={leadId} leadId={leadId} />;
}

function LeadDetailContent({ leadId }: { leadId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [summaryContainer, setSummaryContainer] = useState<HTMLDivElement | null>(null);
  const summaryRef = useCallback((element: HTMLDivElement | null) => setSummaryContainer(element), []);
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId) });
  const stage = useMutation({
    mutationFn: ({ value }: { value: LeadStage; openEstimate?: boolean }) => updateLead(leadId, { stage: value }),
    onSuccess: () => client.invalidateQueries({ queryKey: leadKeys.all })
  });
  if (lead.isPending) return <AsyncState state="loading" message="Loading lead details…" />;
  if (lead.isError) return <AsyncState state="error" message="We couldn't load this lead." actionLabel="Try again" onAction={() => void lead.refetch()} />;
  const item = lead.data;
  const estimateStarted = estimateStartedStages.includes(item.stage);
  const openEstimate = () => {
    if (stage.isPending) return;
    const destination = `/estimator-sales/leads/${leadId}/estimate`;
    if (estimateStarted) {
      navigate(destination);
      return;
    }
    // The keyed detail's observer drops this callback if the user leaves this lead.
    stage.mutate({ value: "estimate_in_progress", openEstimate: true }, { onSuccess: () => navigate(destination) });
  };
  const stageControl = (
    <Field id="lead-detail-stage" label="Lead stage">
      {(props) => (
        <Select {...props} disabled={stage.isPending} value={item.stage} onChange={(event) => stage.mutate({ value: event.target.value as LeadStage })}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      )}
    </Field>
  );
  const workflow = item.projectId ? (
    <ProjectWorkflowPanel key={item.projectId} projectId={item.projectId} showInitialPayment={false} />
  ) : null;
  const content = (
    <div key="content" className="lead-detail__grid">
      <ContactAndEstimateCard
        nextAction={item.nextAction}
        buttonLabel={stage.isPending && stage.variables.openEstimate ? "Opening…" : estimateStarted ? "Continue estimate" : "Start estimate"}
        onContinue={openEstimate}
        buttonDisabled={stage.isPending}
      />
    </div>
  );

  return (
    <section className="lead-detail estimator-dashboard lead-detail--estimate-progress" aria-labelledby="lead-detail-title">
      <Link to="/estimator-sales" className="lead-detail__back-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        All leads
      </Link>
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
      {item.projectId ? (
        <ProjectChatNavigation
          projectId={item.projectId}
          overviewTo={`/estimator-sales/leads/${leadId}`}
          overviewLabel="Lead"
          summaryContainer={summaryContainer}
          presentation="estimate-progress"
        />
      ) : null}
      {stage.isError ? <p role="alert">The lead could not be updated. Try again.</p> : null}
      {content}
      {workflow}
    </section>
  );
}
