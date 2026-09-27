import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { KnowledgeBasket, KnowledgeSubBasket } from "../../../../shared/knowledge/knowledgeTypes";
import { Button, Field } from "../../ui/primitives";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";

export interface VendorBasketOption { readonly id: string; readonly label: string; readonly disabled?: boolean }
export interface VendorBasketGroup { readonly id: string; readonly title: string; readonly options: readonly VendorBasketOption[] }

export function KnowledgeVendorBasketChoices({ label, selectedIds, groups, disabled, readOnly, onToggle }: {
  readonly label: "Main Baskets" | "Sub Baskets";
  readonly selectedIds: readonly string[];
  readonly groups: readonly VendorBasketGroup[];
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = groups.flatMap(group => group.options.map(option => ({ ...option, group: label === "Sub Baskets" ? group.title : "" })));
  const selected = selectedIds.map(id => options.find(option => option.id === id) ?? { id, label: "Unavailable saved selection", group: "" });
  const selectedNames = selected.map(option => `${option.group ? `${option.group} · ` : ""}${option.label}`);
  const preview = selectedNames.length > 2 ? `${selectedNames.slice(0, 2).join(", ")} and ${selectedNames.length - 2} more` : selectedNames.join(", ");
  const visible = groups.map(group => ({ ...group, options: group.options.filter(option => `${group.title} ${option.label}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) })).filter(group => group.options.length);
  return <View style={s.stack}>
    <Text style={s.subtitle}>{label}</Text>
    <Pressable accessibilityRole="combobox" accessibilityLabel={label} accessibilityValue={{ text: selectedIds.length ? `${selectedIds.length} selected: ${preview}` : `Select ${label}` }} accessibilityState={{ disabled: disabled || readOnly, expanded: open }} disabled={disabled || readOnly} onPress={() => { setSearch(""); setOpen(true); }} style={[s.select, (disabled || readOnly) && s.disabled]}>
      <View style={{ flex: 1, gap: 2 }}><Text style={s.text}>{label}: {selectedIds.length} selected</Text>{preview ? <Text style={s.subtitle} numberOfLines={2}>Selected: {preview}</Text> : null}</View><Text aria-hidden style={s.text}>▾</Text>
    </Pressable>
    {readOnly ? selected.map(option => <KnowledgeText key={option.id}>{option.group ? `${option.group} · ` : ""}{option.label}</KnowledgeText>) : null}
    {readOnly && !selectedIds.length ? <KnowledgeText>No {label.toLocaleLowerCase()} selected.</KnowledgeText> : null}
    {open ? <KnowledgeModal title={`Choose ${label}`} onClose={() => setOpen(false)}>
      <Field label={`Search ${label}`} value={search} onChangeText={setSearch} />
      {visible.map(group => <View key={group.id} style={s.stack}>
        {label === "Sub Baskets" ? <KnowledgeText>{group.title}</KnowledgeText> : null}
        {group.options.map(option => <KnowledgeChoice key={option.id} label={option.label} accessibilityLabel={`${label === "Sub Baskets" ? `${group.title}, ` : ""}${option.label}`} multiple selected={selectedIds.includes(option.id)} disabled={disabled || option.disabled === true} onPress={() => onToggle(option.id)} />)}
      </View>)}
      {!visible.length ? <KnowledgeText>No options match.</KnowledgeText> : null}
      <Button label="Done" variant="secondary" onPress={() => setOpen(false)} />
    </KnowledgeModal> : null}
  </View>;
}

export function KnowledgeVendorBasketCreator({ context, parent, onClose, onSaved }: {
  readonly context: KnowledgeMobileContext;
  readonly parent?: KnowledgeBasket;
  readonly onClose: () => void;
  readonly onSaved: (created: KnowledgeBasket | KnowledgeSubBasket) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("0");
  const valid = context.ready && context.canRead && context.canCreate && name.trim().length > 0 && name.trim().length <= 240 && (parent ? parent.status === "active" : Number.isSafeInteger(Number(order)) && Number(order) >= 0);
  const mutation = useMutation({ mutationFn: async () => {
    if (!valid) throw new Error("Review the basket fields before saving.");
    return parent ? context.api.createKnowledgeSubBasket(parent.id, { name: name.trim() }) : context.api.createKnowledgeBasket({ name: name.trim(), description: description.trim() || null, displayOrder: Number(order) });
  }, retry: false, onSuccess: created => { onSaved(created); } });
  const dirty = Boolean(name || description || order !== "0");
  return <KnowledgeModal title={parent ? "Add sub-basket" : "Add main basket"} busy={mutation.isPending} onClose={() => closeCatalogDraft(dirty, onClose)}>
    {parent ? <KnowledgeText>Main basket: {parent.name}</KnowledgeText> : null}
    <Field label="Name" value={name} onChangeText={setName} maxLength={240} editable={!mutation.isPending} />
    {!parent ? <><Field label="Description" value={description} onChangeText={setDescription} maxLength={4000} multiline editable={!mutation.isPending} /><Field label="Display order" value={order} onChangeText={setOrder} keyboardType="number-pad" editable={!mutation.isPending} /></> : null}
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label={parent ? "Add sub-basket" : "Add main basket"} disabled={!valid} loading={mutation.isPending} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}
