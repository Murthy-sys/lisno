import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Checkbox, Field, FileInput, Input, Select, Textarea } from "../../components/ui/Field";
import { FurnitureRequirementsReview } from "./FurnitureRequirementsReview";
import { getFurnitureUoms, performDesignWorkflowAction, projectWorkflowKeys, type DesignWorkflowAction, type DesignWorkflowStage, type DesignWorkflowView } from "./projectWorkflowApi";
import { useRefreshDesignWorkflow } from "./useRefreshDesignWorkflow";
import "./existingFurnitureWorkflow.css";

const supported = new Set(["furniture_request", "furniture_choice", "furniture_upload", "furniture_dimensions_approve", "furniture_dimensions_return"]);
interface PersonalItem {
  id: string; name: string; uomId: string; measurementType: "dimensions" | "count";
  length: string; width: string; height: string; quantity: string;
}
const newItem = (): PersonalItem => ({ id: crypto.randomUUID(), name: "", uomId: "", measurementType: "dimensions", length: "", width: "", height: "", quantity: "" });

export function ExistingFurnitureWorkflow({ workflow, stage, refreshError = false, refreshing = false }: {
  workflow: DesignWorkflowView; stage: DesignWorkflowStage; refreshError?: boolean; refreshing?: boolean;
}) {
  const [selected, setSelected] = useState<DesignWorkflowAction | null>(null);
  const [notice, setNotice] = useState("");
  const operational = stage.operational;
  if (!operational) return null;
  const request = operational.clientFurnitureRequest;
  const actions = operational.availableActions.filter(action => supported.has(action.id));
  const names = request?.roomIds.map(id => operational.rooms?.find(room => room.id === id)?.name ?? workflow.furnitureRooms?.find(room => room.id === id)?.name).filter(Boolean);
  return <section className="existing-furniture" aria-label="Existing furniture collection">
    {notice ? <p role="status">{notice}</p> : null}
    {request ? <div><p>Requested rooms: {names?.join(", ") || "Room details unavailable"}</p>
      <p>{request.hasFurniture === null ? "Awaiting the Client's furniture details." : request.hasFurniture === false ? "The Client confirmed there is no existing furniture." : request.needsAssistance ? "Lisno assistance requested. Additional charges: to be determined." : "The Client will provide the existing furniture dimensions."}</p></div> : <p>No furniture collection has been requested.</p>}
    {operational.rooms?.some(room => room.dimensions) ? <FurnitureRequirementsReview key={`${workflow.projectId}:${stage.id}:${operational.version}`} projectId={workflow.projectId} operational={operational} /> : null}
    <div className="existing-furniture__actions">{actions.map(action => <div key={action.id}><Button variant="secondary" disabled={Boolean(action.disabledReason) || refreshError || refreshing} onClick={() => { setNotice(""); setSelected(action); }}>{action.label}</Button>{action.disabledReason ? <p>{action.disabledReason}</p> : null}</div>)}</div>
    {refreshError ? <p role="alert">Refresh the project workflow before changing furniture details.</p> : null}
    {selected ? <FurnitureActionForm key={selected.id} action={selected} workflow={workflow} stage={stage} blocked={refreshError || refreshing}
      onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setNotice(selected.id === "furniture_choice" ? "Furniture preference saved." : selected.id === "furniture_request" ? "Furniture collection requested from the Client." : selected.id === "furniture_upload" && selected.actor === "client" ? "Furniture dimensions saved and confirmed." : selected.id === "furniture_upload" ? "Dimensions submitted for Client approval." : "Furniture review saved."); }} /> : null}
  </section>;
}

function FurnitureActionForm({ action, workflow, stage, blocked, onClose, onSaved }: {
  action: DesignWorkflowAction; workflow: DesignWorkflowView; stage: DesignWorkflowStage; blocked: boolean; onClose: () => void; onSaved: () => void;
}) {
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const operational = stage.operational!;
  const request = operational.clientFurnitureRequest;
  const upload = action.id === "furniture_upload";
  const review = action.id === "furniture_dimensions_approve" || action.id === "furniture_dimensions_return";
  const selfEntry = upload && action.actor === "client";
  const rooms = action.id === "furniture_request" ? workflow.furnitureRooms ?? [] : (operational.rooms ?? []).filter(room =>
    request?.roomIds.includes(room.id) && (upload ? !room.dimensions || room.dimensions.status === "changes_requested" : !review || room.dimensions && (
      action.actor === "client" ? room.dimensions.provenance === "designer_assisted" && room.dimensions.status === "pending"
        : action.id === "furniture_dimensions_return" && room.dimensions.provenance === "client_self" && room.dimensions.status === "approved")));
  const [version] = useState(operational.version);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [roomIds, setRoomIds] = useState(() => rooms.map(room => room.id));
  const [hasFurniture, setHasFurniture] = useState<string>(request?.hasFurniture == null ? "" : String(request.hasFurniture));
  const [assistance, setAssistance] = useState<string>(request?.needsAssistance == null ? "" : String(request.needsAssistance));
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState<Record<string, PersonalItem[]>>(() => Object.fromEntries(rooms.map(room => {
    const saved = operational.rooms?.find(value => value.id === room.id)?.dimensions?.items;
    return [room.id, saved?.length ? saved.map(item => ({ id: item.id, name: item.name, uomId: item.uomId ?? "", measurementType: item.measurementType ?? "dimensions",
      length: item.measurementType !== "count" ? String(item.length) : "", width: item.measurementType !== "count" ? String(item.width) : "", height: item.measurementType !== "count" && item.height !== undefined ? String(item.height) : "", quantity: item.measurementType === "count" ? String(item.quantity) : "" })) : [newItem()]];
  })));
  const [submissions] = useState(() => new Map((operational.rooms ?? []).flatMap(room => room.dimensions ? [[room.id, room.dimensions.submissionEventId] as const] : [])));
  const submitting = useRef(false);
  const uoms = useQuery({ queryKey: projectWorkflowKeys.furnitureUoms(workflow.projectId), queryFn: ({ signal }) => getFurnitureUoms(workflow.projectId, signal), enabled: upload, retry: false });
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => performDesignWorkflowAction({ projectId: workflow.projectId, stageId: stage.id, expectedVersion: version, action: action.id, data, idempotencyKey, note: note.trim(), file }),
    onSuccess: async () => { await refresh(); onSaved(); },
    onError: async () => { await refresh(); },
    onSettled: () => { submitting.current = false; }
  });
  const currentAction = operational.availableActions.find(value => value.id === action.id);
  const stale = version !== operational.version || !currentAction || Boolean(currentAction.disabledReason);
  const disabled = blocked || stale || mutation.isPending;
  const changeItem = (roomId: string, itemId: string, update: Partial<PersonalItem>) => {
    setDirty(true); setError(""); setItems(previous => ({ ...previous, [roomId]: previous[roomId]!.map(item => item.id === itemId ? { ...item, ...update } : item) }));
  };
  const submit = () => {
    if (disabled || submitting.current) return;
    let data: Record<string, unknown>;
    if (action.id === "furniture_choice") {
      if (!hasFurniture || hasFurniture === "true" && !assistance) { setError("Choose whether you have existing furniture and need assistance."); return; }
      data = { hasFurniture: hasFurniture === "true", ...(hasFurniture === "true" ? { needsAssistance: assistance === "true" } : {}) };
    } else {
      if (!roomIds.length && !(action.id === "furniture_request" && rooms.length === 0)) { setError("Select at least one room."); return; }
      if (action.id === "furniture_request") data = { roomIds };
      else if (review) {
        if (action.id === "furniture_dimensions_return" && !note.trim()) { setError("Explain which measurements need correction."); return; }
        data = { submissions: roomIds.map(roomId => ({ roomId, submissionEventId: submissions.get(roomId) })) };
      } else {
        if (!uoms.data || uoms.isError) { setError("Load the configured units before submitting dimensions."); return; }
        if (selfEntry && !confirmed) { setError("Confirm that you have checked the measurements."); return; }
        const parsed = [];
        for (const roomId of roomIds) {
          if (!items[roomId]?.length) { setError("Add at least one furniture item for each selected room."); return; }
          const rowItems = [];
          for (const item of items[roomId]!) {
            if (!item.name.trim() || !uoms.data.some(unit => unit.id === item.uomId)) { setError("Enter an item name and select a configured unit for each item."); return; }
            if (item.measurementType === "count") {
              if (!/^\d+$/.test(item.quantity.trim()) || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) { setError("Enter a positive whole-number count for each count item."); return; }
              rowItems.push({ id: item.id, name: item.name.trim(), uomId: item.uomId, measurementType: "count", quantity: Number(item.quantity) });
            } else {
              if ([item.length, item.width, ...(item.height.trim() ? [item.height] : [])].some(value => !value.trim() || !Number.isFinite(Number(value)) || Number(value) <= 0)) { setError("Enter positive length and width, and a positive height when provided."); return; }
              rowItems.push({ id: item.id, name: item.name.trim(), uomId: item.uomId, measurementType: "dimensions", length: Number(item.length), width: Number(item.width), ...(item.height.trim() ? { height: Number(item.height) } : {}) });
            }
          }
          parsed.push({ roomId, items: rowItems });
        }
        data = { rooms: parsed, ...(selfEntry ? { confirmed: true } : {}) };
      }
    }
    if (action.requiresProof && !file) { setError("Attach the required evidence document."); return; }
    if (file && !/\.(pdf|png|jpe?g|webp)$/iu.test(file.name)) { setError("Choose a PDF, JPG, PNG or WebP file."); return; }
    setError(""); submitting.current = true; mutation.mutate(data);
  };
  return <ContextPanel title={action.label} eyebrow="Existing furniture" width={upload ? "wide" : "medium"} dirty={dirty} busy={mutation.isPending} onClose={onClose}
    footer={({ requestClose }) => <div className="existing-furniture__actions"><Button type="submit" form={`${id}-form`} busy={mutation.isPending} disabled={disabled || upload && (uoms.isPending || uoms.isError)}>{action.label}</Button><Button variant="secondary" disabled={mutation.isPending} onClick={requestClose}>Cancel</Button></div>}>
    <form id={`${id}-form`} className="existing-furniture__form" noValidate aria-label={action.label} onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={disabled}>
        {action.id === "furniture_choice" ? <>
          <Field id={`${id}-has-furniture`} label="Do you have existing furniture?" required>{props => <Select {...props} value={hasFurniture} onChange={event => { setHasFurniture(event.target.value); setAssistance(""); setDirty(true); }}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></Select>}</Field>
          {hasFurniture === "true" ? <Field id={`${id}-assistance`} label="Need Lisno assistance?" required>{props => <Select {...props} value={assistance} onChange={event => { setAssistance(event.target.value); setDirty(true); }}><option value="">Select</option><option value="true">Yes</option><option value="false">No, I will provide the dimensions</option></Select>}</Field> : null}
          {hasFurniture === "true" && assistance === "true" ? <p>Additional charges: to be determined. Your team will confirm the fee separately.</p> : null}
        </> : <fieldset><legend>{review ? "Rooms to review" : "Rooms"}</legend>{rooms.map(room => <label key={room.id}><Checkbox checked={roomIds.includes(room.id)} onChange={event => { setRoomIds(previous => event.target.checked ? [...previous, room.id] : previous.filter(value => value !== room.id)); setDirty(true); }} />{room.name}</label>)}{!rooms.length ? <p>No applicable project rooms are available.</p> : null}</fieldset>}
        {upload ? <>
          {uoms.isPending ? <p role="status">Loading configured units…</p> : uoms.isError ? <p role="alert">Units could not be loaded. <Button variant="secondary" onClick={() => void uoms.refetch()}>Retry units</Button></p> : null}
          {rooms.filter(room => roomIds.includes(room.id)).map(room => <section className="existing-furniture__room" key={room.id} aria-label={`Furniture in ${room.name}`}><h3>{room.name}</h3>
            {(items[room.id] ?? []).map((item, index) => <fieldset className="existing-furniture__item" key={item.id}><legend>Furniture item {index + 1}</legend>
              <Field id={`${id}-${item.id}-name`} label={`Item name in ${room.name}`} required>{props => <Input {...props} maxLength={200} value={item.name} onChange={event => changeItem(room.id, item.id, { name: event.target.value })} />}</Field>
              <Field id={`${id}-${item.id}-type`} label={`Measurement type for item ${index + 1}`} required>{props => <Select {...props} value={item.measurementType} onChange={event => changeItem(room.id, item.id, { measurementType: event.target.value as PersonalItem["measurementType"] })}><option value="dimensions">Dimensions</option><option value="count">Count</option></Select>}</Field>
              <Field id={`${id}-${item.id}-unit`} label={`Unit for item ${index + 1}`} required>{props => <Select {...props} value={item.uomId} onChange={event => changeItem(room.id, item.id, { uomId: event.target.value })}><option value="">Choose unit</option>{uoms.data?.map(unit => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</Select>}</Field>
              {(item.measurementType === "count" ? ["quantity"] as const : ["length", "width", "height"] as const).map(field => <Field key={field} id={`${id}-${item.id}-${field}`} label={`${field === "quantity" ? "Count" : field[0]!.toUpperCase() + field.slice(1)} for item ${index + 1}`} required={field !== "height"}>{props => <Input {...props} type="text" inputMode={field === "quantity" ? "numeric" : "decimal"} value={item[field]} onChange={event => changeItem(room.id, item.id, { [field]: event.target.value })} />}</Field>)}
              <Button variant="quiet" onClick={() => { setItems(previous => ({ ...previous, [room.id]: previous[room.id]!.filter(value => value.id !== item.id) })); setDirty(true); }}>Remove item {index + 1}</Button>
            </fieldset>)}
            <Button variant="secondary" onClick={() => { setItems(previous => ({ ...previous, [room.id]: [...(previous[room.id] ?? []), newItem()] })); setDirty(true); }}>Add furniture item in {room.name}</Button>
          </section>)}
          {selfEntry ? <label><Checkbox checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }} />I have checked and confirm these furniture measurements.</label> : <p>The Client will review these measurements before the rooms are marked ready.</p>}
        </> : null}
        {action.requiresProof || upload ? <Field id={`${id}-file`} label={action.requiresProof ? "Furniture dimensions evidence" : "Supporting document (optional)"} required={action.requiresProof}>{props => <FileInput {...props} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={event => { setFile(event.target.files?.[0] ?? null); setDirty(true); }} />}</Field> : null}
        {action.id === "furniture_dimensions_return" ? <Field id={`${id}-reason`} label="Corrections needed" required>{props => <Textarea {...props} value={note} maxLength={1000} onChange={event => { setNote(event.target.value); setDirty(true); }} />}</Field> : null}
      </fieldset>
      {stale ? <p role="alert">The furniture request changed. Your entries are preserved. Close this form and review the current request before submitting.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {mutation.isError ? <p role="alert">{mutation.error instanceof Error ? mutation.error.message : "The action could not be saved."}</p> : null}
    </form>
  </ContextPanel>;
}
