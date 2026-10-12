import { Button } from "../../components/ui/Button";
import type { ProposalMasterResource } from "./proposalTypes";

export function ProposalMasterList({ resources, editable, busy, onEdit, onRemove }: {
  resources: readonly ProposalMasterResource[]; editable: boolean; busy: boolean;
  onEdit: (resource: ProposalMasterResource) => void; onRemove: (resource: ProposalMasterResource) => void;
}) {
  if (!resources.length) return null;
  return <section className="basket-proposal__masters" aria-label="Proposed UOMs and surfaces">
    <h3>Proposed UOMs and surfaces</h3><p>These values belong to this proposal. Super Admin reviews them before they become shared.</p>
    <ul>{resources.map(resource => <li key={resource.resourceId}>
      <div><strong>{resource.payload.name}</strong><p>{resource.kind === "uom" ? `UOM · ${resource.payload.decimalScale} decimal places` : "Surface"} · Proposed</p>{resource.payload.description ? <p>{resource.payload.description}</p> : null}</div>
      {editable ? <div className="basket-proposal__actions"><Button variant="quiet" size="compact" disabled={busy} aria-label={`Edit proposed ${resource.payload.name}`} onClick={() => onEdit(resource)}>Edit</Button><Button variant="quiet" size="compact" disabled={busy} aria-label={`Remove proposed ${resource.payload.name}`} onClick={() => onRemove(resource)}>Remove</Button></div> : null}
    </li>)}</ul>
  </section>;
}
