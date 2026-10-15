import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";

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
