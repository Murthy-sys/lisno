import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { refreshEstimateCollaboration } from "../leads/estimateCollaborationQueries";
import { designTeamKeys, getDesignTeam, saveSecondaryDesigners, type DesignTeamMember } from "./designTeamApi";
import "./designTeamPicker.css";

export function DesignTeamPicker({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<{ version: number; members: DesignTeamMember[] } | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closePicker = () => { setExpanded(false); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!expanded) return;
    searchRef.current?.focus();
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setExpanded(false);
        if (!(event.target instanceof Element) || !event.target.closest('button, input, textarea, select, a[href], [tabindex]')) triggerRef.current?.focus();
      }
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [expanded]);
  const query = useQuery({ queryKey: designTeamKeys.detail(projectId, search), queryFn: () => getDesignTeam(projectId, search), retry: false,
    placeholderData: previous => previous?.projectId === projectId ? previous : undefined });
  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Choose the secondary Designers first.");
      return saveSecondaryDesigners(projectId, { expectedVersion: draft.version, designerIds: draft.members.map(member => member.id), ...(reason.trim() ? { reason: reason.trim() } : {}) });
    },
    onSuccess: async () => {
      setDraft(null); setReason(""); setNotice("Design team saved.");
      await Promise.all([client.invalidateQueries({ queryKey: designTeamKeys.all }), refreshEstimateCollaboration(client)]);
    },
    onError: async () => { await query.refetch(); }
  });
  if (query.isPending) return <section className="design-team-picker" aria-label="Design team"><p role="status">Loading design team…</p></section>;
  if (query.isError || !query.data) return <section className="design-team-picker" aria-label="Design team"><p role="alert">The design team could not be loaded.</p><Button variant="secondary" onClick={() => void query.refetch()}>Retry design team</Button></section>;
  const team = query.data;
  const selected = draft?.members ?? team.secondaries;
  const stale = Boolean(draft && draft.version !== team.version) || save.error instanceof ApiError && save.error.status === 409;
  const options = [...new Map([...selected, ...team.candidates].map(member => [member.id, member])).values()].filter(member => member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const disabled = !team.canManage || stale || save.isPending || query.isFetching;
  const toggle = (member: DesignTeamMember, checked: boolean) => {
    if (disabled || checked && selected.length >= 3) return;
    setNotice(""); save.reset();
    setDraft({ version: draft?.version ?? team.version, members: checked ? [...selected, member] : selected.filter(value => value.id !== member.id) });
  };
  return <section className="design-team-picker" aria-labelledby={`design-team-${projectId}`}>
    <div className="design-team-picker__heading"><h3 id={`design-team-${projectId}`}>Design team</h3></div>
    <p>Primary Designer: <strong>{team.primary?.name ?? "Not assigned"}</strong></p>
    {team.secondaries.length ? <p>Secondary Designers: {team.secondaries.map(member => member.name).join(", ")}</p> : <p>No secondary Designers selected.</p>}
    {notice ? <p role="status">{notice}</p> : null}
    {team.canManage ? <>
      <div className="design-team-picker__control" ref={pickerRef} onKeyDown={event => {
        if (event.key === "Escape" && expanded) { event.preventDefault(); closePicker(); }
      }}>
        <button type="button" className="design-team-picker__trigger" ref={triggerRef} disabled={save.isPending} aria-label="Secondary Designers" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `secondary-designers-${projectId}` : undefined} onClick={() => setExpanded(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setExpanded(true); searchRef.current?.focus(); } }}>
          <span>Secondary Designers</span><span>{selected.length} of 3 selected</span>
        </button>
        {expanded ? <div className="design-team-picker__popover">
      <label>Search Designers<input ref={searchRef} type="search" value={search} disabled={save.isPending} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); pickerRef.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')?.focus(); } }} /></label>
      {query.isFetching ? <p role="status">Updating Designers…</p> : null}
      <div id={`secondary-designers-${projectId}`} role="listbox" aria-label="Secondary Designers" aria-multiselectable="true" aria-busy={query.isFetching} className="design-team-picker__options" onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>{options.map(member => {
        const checked = selected.some(value => value.id === member.id);
        return <button type="button" role="option" aria-selected={checked} key={member.id} disabled={disabled || !checked && selected.length >= 3} onClick={() => toggle(member, !checked)}><span>{member.name}</span><span aria-hidden="true">{checked ? "Selected" : ""}</span></button>;
      })}</div>{!options.length ? <p role="status">No eligible Designers match your search.</p> : null}
        </div> : null}
      </div>
      {selected.length ? <ul className="design-team-picker__selected" aria-label="Selected secondary Designers">{selected.map(member => <li key={member.id}><span>{member.name}</span><button type="button" aria-label={`Remove ${member.name}`} disabled={disabled} onClick={() => { toggle(member, false); closePicker(); }}>×</button></li>)}</ul> : null}
      {draft && team.requiresReason ? <label>Assignment change reason<textarea value={reason} maxLength={1000} required disabled={disabled} onChange={event => setReason(event.target.value)} /></label> : null}
      {stale ? <p role="alert">The team changed. Your selection is preserved. Discard it and review the current assignments before saving.</p> : null}
      {save.isError ? <p role="alert">{save.error instanceof Error ? save.error.message : "The team could not be saved."}</p> : null}
      {draft ? <div className="design-team-picker__actions"><Button disabled={disabled || Boolean(team.requiresReason && !reason.trim())} busy={save.isPending} onClick={() => { closePicker(); save.mutate(); }}>Save team</Button><Button variant="secondary" disabled={save.isPending} onClick={() => { setDraft(null); setReason(""); setSearch(""); save.reset(); closePicker(); }}>Cancel</Button></div> : null}
    </> : null}
  </section>;
}
