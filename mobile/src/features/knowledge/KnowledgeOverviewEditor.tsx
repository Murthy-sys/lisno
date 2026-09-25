import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { KnowledgeMaster, KnowledgeJsonValue } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, IconButton } from "./knowledgeDetailUi";
import type { KnowledgeEditorProps } from "./knowledgeEditorContracts";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles } from "./knowledgeDetailUi";

export function KnowledgeOverviewEditor({ payload, onChange, readOnly, context, masters, catalogsReady, onBusyChange }: KnowledgeEditorProps) {
  const [selecting, setSelecting] = useState(false);
  const [editor, setEditor] = useState<{ type: "uoms" | "surfaces"; existing?: KnowledgeMaster } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [scale, setScale] = useState("2");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const uoms = masters.uoms ?? [];
  const surfaces = masters.surfaces ?? [];
  const selected = Array.isArray(payload.surfaceIds) ? payload.surfaceIds.filter((value): value is string => typeof value === "string") : [];
  function change(key: string, value?: KnowledgeJsonValue) {
    if (readOnly) return;
    const next = { ...payload };
    if (value === undefined) delete next[key]; else next[key] = value;
    onChange(next);
  }
  function open(type: "uoms" | "surfaces", existing?: KnowledgeMaster) {
    setEditor({ type, ...(existing ? { existing } : {}) });
    setName(existing?.name ?? ""); setCode(existing?.code ?? ""); setDescription(existing?.description ?? ""); setScale(String(existing?.decimalScale ?? 2)); setError("");
  }
  async function save() {
    if (!editor || busy || operation.current || readOnly) return;
    if (!name.trim() || (editor.type === "uoms" && !code.trim())) { setError("Enter the required name and code."); return; }
    if (editor.type === "uoms" && (!/^\d$/u.test(scale) || Number(scale) > 3)) { setError("Choose a UOM decimal scale from 0 to 3."); return; }
    if (editor.existing ? !context.canUpdate : !context.canCreate) return;
    operation.current = true; setBusy(true); setError("");
    try {
      const value = editor.type === "uoms"
        ? await context.api.createKnowledgeMaster("uoms", { name: name.trim(), code: code.trim(), description: description.trim() || null, decimalScale: Number(scale) })
        : editor.existing
          ? await context.api.updateKnowledgeSurface(editor.existing.id, { expectedVersion: editor.existing.version, name: name.trim(), description: description.trim() || null })
          : await context.api.createKnowledgeSurface({ name: name.trim(), description: description.trim() || null });
      if (editor.type === "uoms") change("uomId", value.id);
      else if (!editor.existing) change("surfaceIds", [...selected, value.id]);
      setEditor(null);
      await context.refresh().catch(() => undefined);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not save this reusable value. Your entries are retained."); }
    finally { operation.current = false; setBusy(false); }
  }
  return <View style={knowledgeStyles.stack}>
    <KnowledgeCard title="UOM" actions={!readOnly && context.canCreate ? <IconButton label="Add Unit" icon="add" onPress={() => open("uoms")} /> : null}>
      <KnowledgeSelect label="Unit of measure (UOM)" value={typeof payload.uomId === "string" ? payload.uomId : ""} options={uoms.filter(value => value.status === "active" || value.id === payload.uomId).map(value => ({ value: value.id, label: value.name, disabled: value.status !== "active" }))} disabled={readOnly || !catalogsReady} onChange={value => change("uomId", value || undefined)} />
    </KnowledgeCard>
    <KnowledgeCard title="Surfaces" actions={!readOnly && context.canCreate ? <IconButton label="Add Surface" icon="add" onPress={() => open("surfaces")} /> : null}>
      <Button label="Select applicable surfaces" variant="secondary" disabled={readOnly || !catalogsReady} onPress={() => setSelecting(true)} />
      {!selected.length ? <KnowledgeText>No surfaces selected.</KnowledgeText> : selected.map(id => {
        const surface = surfaces.find(value => value.id === id);
        return <View key={id} style={knowledgeStyles.row}>
          <View style={{ flex: 1, minWidth: 100, gap: 2 }}><Text style={knowledgeStyles.subtitle}>{surface?.name ?? "Unavailable saved surface"}{surface?.status && surface.status !== "active" ? ` (${surface.status})` : ""}</Text>
          {surface?.description ? <KnowledgeText>{surface.description}</KnowledgeText> : null}</View>
          {!readOnly ? <View style={knowledgeStyles.row}>
            {surface && context.canUpdate ? <IconButton label={`Edit ${surface.name}`} icon="edit" onPress={() => open("surfaces", surface)} /> : null}
            <IconButton label={`Remove ${surface?.name ?? "unavailable surface"}`} icon="close" onPress={() => change("surfaceIds", selected.filter(value => value !== id))} />
          </View> : null}
        </View>;
      })}
    </KnowledgeCard>
    {selecting ? <KnowledgeModal title="Applicable surfaces" onClose={() => setSelecting(false)}>
      {surfaces.filter(surface => surface.status === "active" || selected.includes(surface.id)).map(surface => <KnowledgeChoice key={surface.id} multiple label={surface.name} selected={selected.includes(surface.id)} disabled={surface.status !== "active" && !selected.includes(surface.id)} onPress={() => change("surfaceIds", selected.includes(surface.id) ? selected.filter(id => id !== surface.id) : [...selected, surface.id])} />)}
      {!surfaces.length ? <KnowledgeText>No surfaces are available. Add a Surface to continue.</KnowledgeText> : null}
      <Button label="Done" onPress={() => setSelecting(false)} />
    </KnowledgeModal> : null}
    {editor ? <KnowledgeModal title={`${editor.existing ? "Edit" : "Add"} ${editor.type === "uoms" ? "Unit" : "Surface"}`} busy={busy} onClose={() => setEditor(null)}>
      <Field label="Name" value={name} onChangeText={setName} editable={!busy} maxLength={240} />
      {editor.type === "uoms" ? <><Field label="Code" value={code} onChangeText={setCode} editable={!busy} maxLength={80} /><Field label="Decimal scale" value={scale} onChangeText={setScale} editable={!busy} keyboardType="number-pad" /></> : null}
      <Field label="Description" value={description} onChangeText={setDescription} editable={!busy} multiline maxLength={4000} />
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
      <Button label="Save reusable value" loading={busy} onPress={() => void save()} />
    </KnowledgeModal> : null}
  </View>;
}
