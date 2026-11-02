import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  const options = [...new Map([...selected, ...team.candidates].map(member => [member.id, member])).values()];
  const disabled = !team.canManage || stale || save.isPending || query.isFetching;
  const toggle = (member: DesignTeamMember, checked: boolean) => {
    if (disabled || checked && selected.length >= 3) return;
    setNotice(""); save.reset();
    setDraft({ version: draft?.version ?? team.version, members: checked ? [...selected, member] : selected.filter(value => value.id !== member.id) });
  };
  return <section className="design-team-picker" aria-labelledby={`design-team-${projectId}`}>
    <div className="design-team-picker__heading"><h3 id={`design-team-${projectId}`}>Design team</h3>{team.canManage ? <Button variant="quiet" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={`secondary-designers-${projectId}`}>{expanded ? "Close team selection" : "Choose secondary Designers"}</Button> : null}</div>
    <p>Primary Designer: <strong>{team.primary?.name ?? "Not assigned"}</strong></p>
    {team.secondaries.length ? <p>Secondary Designers: {team.secondaries.map(member => member.name).join(", ")}</p> : <p>No secondary Designers selected.</p>}
    {notice ? <p role="status">{notice}</p> : null}
    {expanded && team.canManage ? <div id={`secondary-designers-${projectId}`}>
      <label>Search Designers<input type="search" value={search} disabled={save.isPending} onChange={event => setSearch(event.target.value)} /></label>
      <p>{selected.length} of 3 selected</p>
      <fieldset disabled={disabled}><legend>Secondary Designers</legend>{options.map(member => {
        const checked = selected.some(value => value.id === member.id);
        return <label key={member.id}><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 3} onChange={event => toggle(member, event.target.checked)} />{member.name}</label>;
      })}{!options.length ? <p>No eligible Designers match your search.</p> : null}</fieldset>
      {team.requiresReason ? <label>Assignment change reason<textarea value={reason} maxLength={1000} required disabled={disabled} onChange={event => setReason(event.target.value)} /></label> : null}
      {stale ? <p role="alert">The team changed. Your selection is preserved. Discard it and review the current assignments before saving.</p> : null}
      {save.isError ? <p role="alert">{save.error instanceof Error ? save.error.message : "The team could not be saved."}</p> : null}
      {draft ? <div className="design-team-picker__actions"><Button disabled={disabled || Boolean(team.requiresReason && !reason.trim())} busy={save.isPending} onClick={() => save.mutate()}>Save design team</Button><Button variant="secondary" disabled={save.isPending} onClick={() => { setDraft(null); setReason(""); save.reset(); }}>Discard selection</Button></div> : null}
    </div> : null}
  </section>;
}
