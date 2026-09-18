import { BadgeCheck, Layers3, PackageOpen, Search } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import type { ProcurementProject, ProjectProcurementItem } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import { ProjectProcurementItems } from "./ProjectProcurementItems";
import { ProjectProcurementItemEditor } from "./ProjectProcurementItemEditor";
import { sameProcurementParent, type ProcurementParentSource } from "./projectProcurementApi";

export function EstimateProcurementItems({ project }: { project: ProcurementProject | null }) {
  const id = useId();
  const auth = useAuth();
  const canEdit = hasFrontendPermission(auth.authorization, "procurement.items.read") && hasFrontendPermission(auth.authorization, "procurement.items.manage");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ item: ProjectProcurementItem | null; projectId: string; projectName: string; source?: ProcurementParentSource; parentLabel?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const returnFocusRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const options = project?.sections.flatMap((section) => section.items.map((item) => ({
    estimateId: project.estimateId, estimateVersion: project.estimateVersion, sourceLineItemKey: item.key,
    label: `${item.specification} · ${item.roomName} · ${item.catalogueId}`
  }))) ?? [];
  const sections = project?.sections.map((section) => ({ ...section, items: section.items.filter((item) =>
    !search || [item.specification, item.roomName, item.catalogueId, section.label].some((value) => value.toLocaleLowerCase().includes(search))
  ) })).filter((section) => section.items.length) ?? [];
  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(draft.normalize("NFKC").trim().toLocaleLowerCase());
  }
  return <>{project ? <Surface as="section" className="estimate-procurement" aria-labelledby={`${id}-title`}>
    <div className="estimate-procurement__heading">
      <div className="estimate-procurement__title"><span className="estimate-procurement__mark" aria-hidden="true"><PackageOpen /></span><div><h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>Procurement items</h2><p>Add and manage materials under each estimate item.</p></div></div>
      <span className="estimate-procurement__approved"><BadgeCheck aria-hidden="true" />Approved estimate v{project.estimateVersion}</span>
    </div>
    <form className="project-procurement-items__search" role="search" aria-label="Search estimate items" onSubmit={submit}>
      <label className="sr-only" htmlFor={`${id}-search`}>Search estimate item, room or section</label>
      <Input id={`${id}-search`} type="search" placeholder="Search estimate item, room or section" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="secondary" size="compact" leadingIcon={<Search />}>Search</Button>
      {search ? <Button variant="quiet" size="compact" onClick={() => { setDraft(""); setSearch(""); }}>Clear</Button> : null}
      <span className="estimate-procurement__count">{options.length} estimate {options.length === 1 ? "item" : "items"}</span>
    </form>
    {notice ? <p role="status" className="estimate-procurement__notice">{notice}</p> : null}
    {sections.length ? sections.map((section) => <div key={section.id} className="estimate-procurement__section">
      <div className="estimate-procurement__section-heading"><h3><Layers3 aria-hidden="true" />{section.label}</h3><span>{section.items.length} {section.items.length === 1 ? "item" : "items"}</span></div>
      {section.items.map((item) => <ProjectProcurementItems key={item.key} projectId={project.projectId} projectName={project.projectName}
        source={{ estimateId: project.estimateId, estimateVersion: project.estimateVersion, sourceLineItemKey: item.key }} estimateItem={item}
        onEditorRequested={(child, opener) => {
          returnFocusRef.current = opener;
          setNotice("");
          setEditor({ item: child, projectId: project.projectId, projectName: project.projectName, source: { estimateId: project.estimateId, estimateVersion: project.estimateVersion, sourceLineItemKey: item.key }, parentLabel: `${item.specification} — ${item.roomName}` });
        }} />)}
    </div>) : <PageState state="empty" message={search ? "No estimate items match your search." : "This approved estimate has no selected items."} />}
    <ProjectProcurementItems projectId={project.projectId} projectName={project.projectName} unassigned assignmentOptions={options}
      onEditorRequested={(item, opener) => { returnFocusRef.current = opener; setNotice(""); setEditor({ item, projectId: project.projectId, projectName: project.projectName }); }} />
  </Surface> : null}
    {editor && canEdit ? <ProjectProcurementItemEditor key={editor.item?.id ?? JSON.stringify(editor.source)} projectId={editor.projectId} projectName={editor.projectName}
      item={editor.item} source={editor.source} parentLabel={editor.parentLabel} assignmentOptions={options}
      sourceStale={!project || Boolean(editor.source && !options.some((option) => sameProcurementParent(editor.source, option)))}
      returnFocusRef={returnFocusRef} fallbackFocusRef={headingRef} onClose={() => setEditor(null)}
      onSaved={(saved) => { setNotice(`${saved.itemName} ${editor.item ? "updated" : "added"}.`); setEditor(null); }} /> : null}
  </>;
}
