import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { ProjectVendorSuggestionsPanel } from "./ProjectVendorSuggestionsPanel";
import { procurementError } from "./procurementPresentation";
import { getSuggestionProjects, vendorSuggestionKeys, type VendorSuggestionProject } from "./vendorSuggestionsApi";

export function SalesProcurementProjects() {
  const id = useId();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<VendorSuggestionProject | null>(null);
  const opener = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({ queryKey: vendorSuggestionKeys.projectList(q, offset), queryFn: ({ signal }) => getSuggestionProjects(q, offset, signal) });
  function apply(event: FormEvent) { event.preventDefault(); setQ(search.trim()); setOffset(0); }
  return <Surface as="section" className="vendor-procurement__surface" aria-labelledby={`${id}-title`}>
    <div className="vendor-procurement__heading"><div><h2 id={`${id}-title`} ref={heading} tabIndex={-1}>Design-approved projects</h2><p>Your assigned projects become available after Design approval.</p></div></div>
    <form className="vendor-procurement__filters" role="search" aria-label="Search eligible projects" onSubmit={apply}><Field id={`${id}-search`} label="Search projects">{(props) => <Input {...props} type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />}</Field><Button type="submit" variant="secondary" size="compact" leadingIcon={<Search />}>Search</Button></form>
    {query.isPending ? <PageState state="loading" message="Loading approved projects…" /> : query.isError ? <PageState state="error" message={procurementError(query.error, "Approved projects could not be loaded.")} action={{ label: "Retry projects", onAction: () => void query.refetch() }} /> : !query.data.items.length ? <PageState state="empty" message={q ? "No approved projects match your search." : "No assigned projects are ready for vendor suggestions. They appear after Design approval."} /> : <ul className="vendor-procurement__projects" aria-label="Projects ready for vendor suggestions">
      {query.data.items.map((project) => <li key={project.projectId}><div><h3>{project.projectName}</h3><p>Estimate v{project.estimateVersion} · Design v{project.designPlanVersion}</p></div><StatusBadge label="Design approved" tone="success" /><Button variant="secondary" size="compact" trailingIcon={<ArrowRight />} aria-label={`Suggest vendors for ${project.projectName}`} onClick={(event) => { opener.current = event.currentTarget; setSelected(project); }}>Suggest vendors</Button></li>)}
    </ul>}
    {!query.isError && query.data && (query.data.total > 20 || offset > 0) ? <nav className="vendor-procurement__pagination" aria-label="Approved project pages"><Button size="compact" variant="secondary" disabled={!offset || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</Button><span>{query.data.total} projects</span><Button size="compact" variant="secondary" disabled={offset + 20 >= query.data.total || query.isFetching} onClick={() => setOffset((value) => value + 20)}>Next</Button></nav> : null}
    {selected ? <ProjectVendorSuggestionsPanel key={selected.projectId} project={selected} onClose={() => setSelected(null)} returnFocusRef={opener} fallbackFocusRef={heading} /> : null}
  </Surface>;
}
