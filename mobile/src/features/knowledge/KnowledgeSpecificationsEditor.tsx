import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../ui/tokens";
import { Button, Field, IconButton } from "./knowledgeDetailUi";
import { knowledgeRowId } from "../../../../shared/knowledge/knowledgeId";
import type { KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import { KNOWLEDGE_MAX_BRANDS, KNOWLEDGE_MAX_SPECIFICATIONS, parseKnowledgeSpecifications, referencedSpecificationIds, validateKnowledgeBrands } from "../../../../shared/knowledge/knowledgeSpecificationConfiguration";
import { KnowledgeCard, KnowledgeModal, KnowledgeSelect, KnowledgeText } from "./knowledgeDetailUi";
import { isKnowledgeObject, knowledgeText, patchKnowledgeRow } from "./knowledgeModeNativeModel";

interface Props {
  readonly payload: KnowledgeJsonObject;
  readonly onChange: (payload: KnowledgeJsonObject) => void;
  readonly readOnly: boolean;
  readonly protectedIds?: readonly string[];
}

export function KnowledgeSpecificationsEditor({ payload, onChange, readOnly, protectedIds = [] }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [brandEditor, setBrandEditor] = useState<string | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState<{ kind: "brands" | "specifications"; id: string; name: string } | null>(null);
  const specifications = Array.isArray(payload.specifications) ? payload.specifications : [];
  const brands = Array.isArray(payload.brands) ? payload.brands : [];
  const brandRows = brands.filter(isKnowledgeObject);
  const blocked = new Set([...protectedIds, ...referencedSpecificationIds(payload.priceEntries)]);
  const parsed = parseKnowledgeSpecifications(payload.specifications, payload.brands ?? []);
  const issues = [...parsed.issues, ...validateKnowledgeBrands(payload.brands)];
  const selected = specifications.find(row => isKnowledgeObject(row) && row.id === editing);
  const brand = brands.find(row => isKnowledgeObject(row) && row.id === brandEditor);
  const patch = (key: string, id: string, values: KnowledgeJsonObject) => { if (!readOnly) onChange(patchKnowledgeRow(payload, key, id, values)); };
  const issue = (path: string) => issues.find(entry => entry.path === path)?.message;
  const specIndex = specifications.findIndex(row => isKnowledgeObject(row) && row.id === editing);
  const brandIndex = brands.findIndex(row => isKnowledgeObject(row) && row.id === brandEditor);

  function add(kind: "brands" | "specifications") {
    if (readOnly) return;
    const id = knowledgeRowId();
    const rows = kind === "brands" ? brands : specifications;
    if (rows.length >= (kind === "brands" ? KNOWLEDGE_MAX_BRANDS : KNOWLEDGE_MAX_SPECIFICATIONS)) return;
    onChange({ ...payload, [kind]: [...rows, { id, name: "" }], ...(kind === "brands" && editing ? { specifications: specifications.map(row => isKnowledgeObject(row) && row.id === editing ? { ...row, brandId: id } : row) } : {}) });
    if (kind === "specifications") setEditing(id);
    else setBrandEditor(id);
  }

  return <KnowledgeCard title="Specifications" actions={!readOnly ? <IconButton label="Add Specification" icon="add" variant="quiet" disabled={specifications.length >= KNOWLEDGE_MAX_SPECIFICATIONS} onPress={() => add("specifications")} /> : null}>
    <KnowledgeText>Configure items, Brands and descriptions for this Main Line.</KnowledgeText>
    {issues.length ? <KnowledgeText error>{issues.map(entry => entry.message).filter((text, index, all) => all.indexOf(text) === index).join("\n")}</KnowledgeText> : null}
    {!specifications.length ? <KnowledgeText>No Specifications configured.</KnowledgeText> : null}
    {specifications.map((row, index) => isKnowledgeObject(row) ? <View key={`${knowledgeText(row.id)}:${index}`} style={styles.item}>
      <View style={styles.itemHeading}>
        <View style={styles.itemSummary}>
          <Text style={styles.itemName}>{index + 1}. {knowledgeText(row.name) || "Item not named"}</Text>
          <KnowledgeText>Brand: {brandRows.find(entry => entry.id === row.brandId)?.name as string || (row.brandId ? "Unavailable Brand" : "Not configured")}</KnowledgeText>
        </View>
        <View style={styles.actions}>
          <IconButton label={`${readOnly ? "View" : "Edit"} Specification ${index + 1}`} icon={readOnly ? "right" : "edit"} variant="quiet" onPress={() => setEditing(knowledgeText(row.id))} />
          {!readOnly ? <IconButton label={`Remove Specification ${index + 1}`} icon="close" variant="quiet" disabled={blocked.has(knowledgeText(row.id))} onPress={() => setConfirmRemoval({ kind: "specifications", id: knowledgeText(row.id), name: knowledgeText(row.name) || "this Specification" })} /> : null}
        </View>
      </View>
      {knowledgeText(row.description) ? <KnowledgeText>{knowledgeText(row.description)}</KnowledgeText> : null}
      {blocked.has(knowledgeText(row.id)) ? <KnowledgeText>This Specification is used by saved configuration or price history and cannot be removed.</KnowledgeText> : null}
      {["type", "options", "value"].some(key => Object.hasOwn(row, key)) ? <KnowledgeText>Legacy typed fields are retained with this Specification.</KnowledgeText> : null}
    </View> : <KnowledgeText key={index} error>Saved Specification {index + 1} cannot be edited safely. Its data is retained.</KnowledgeText>)}
    <View style={styles.brands}>
      <View style={styles.itemHeading}><Text accessibilityRole="header" style={[styles.sectionTitle, styles.itemSummary]}>Brands</Text>{!readOnly ? <IconButton label="Add Brand" icon="add" variant="quiet" disabled={brands.length >= KNOWLEDGE_MAX_BRANDS} onPress={() => add("brands")} /> : null}</View>
      {!brands.length ? <KnowledgeText>No Brands configured.</KnowledgeText> : null}
      {brandRows.map((row, index) => <View key={`${knowledgeText(row.id)}:${index}`} style={styles.brandRow}>
        <Text style={[styles.itemName, styles.itemSummary]}>{knowledgeText(row.name) || "Brand not named"}</Text>
        <View style={styles.actions}><IconButton label={`${readOnly ? "View" : "Edit"} Brand ${index + 1}`} icon={readOnly ? "right" : "edit"} variant="quiet" onPress={() => setBrandEditor(knowledgeText(row.id))} />
          {!readOnly ? <IconButton label={`Remove Brand ${index + 1}`} icon="close" variant="quiet" disabled={specifications.some(spec => isKnowledgeObject(spec) && spec.brandId === row.id)} onPress={() => setConfirmRemoval({ kind: "brands", id: knowledgeText(row.id), name: knowledgeText(row.name) || "this Brand" })} /> : null}
        </View>
      </View>)}
    </View>
    {isKnowledgeObject(selected) ? <KnowledgeModal title={`${readOnly ? "View" : "Edit"} Specification`} onClose={() => setEditing(null)}>
      <Field label="Item name" value={knowledgeText(selected.name)} editable={!readOnly} maxLength={240} error={issue(`specifications.${specIndex}.name`)} onChangeText={name => patch("specifications", editing!, { name })} />
      <KnowledgeSelect label="Brand" value={knowledgeText(selected.brandId)} options={brandRows.map(row => ({ value: knowledgeText(row.id), label: knowledgeText(row.name) || "Brand not named" }))} disabled={readOnly} onChange={brandId => {
        if (readOnly) return;
        const next = { ...selected };
        if (brandId) next.brandId = brandId; else delete next.brandId;
        onChange({ ...payload, specifications: specifications.map(row => row === selected ? next : row) });
      }} />
      {!readOnly ? <Button label="Add Brand" variant="secondary" onPress={() => add("brands")} /> : null}
      <Field label="Brief description" value={knowledgeText(selected.description)} editable={!readOnly} multiline maxLength={4000} error={issue(`specifications.${specIndex}.description`)} onChangeText={description => patch("specifications", editing!, { description })} />
    </KnowledgeModal> : null}
    {isKnowledgeObject(brand) ? <KnowledgeModal title={`${readOnly ? "View" : "Edit"} Brand`} onClose={() => setBrandEditor(null)}>
      <Field label="Brand name" value={knowledgeText(brand.name)} editable={!readOnly} maxLength={240} error={issue(`brands.${brandIndex}.name`)} onChangeText={name => patch("brands", brandEditor!, { name })} />
      <Field label="Brand description" value={knowledgeText(brand.description)} editable={!readOnly} multiline maxLength={4000} onChangeText={description => {
        const next = { ...brand }; if (description.trim()) next.description = description; else delete next.description;
        if (!readOnly) onChange({ ...payload, brands: brands.map(row => row === brand ? next : row) });
      }} />
    </KnowledgeModal> : null}
    {confirmRemoval ? <KnowledgeModal title={`Remove ${confirmRemoval.name}?`} onClose={() => setConfirmRemoval(null)}>
      <KnowledgeText>The item will be removed from your draft. Save the Mode tab to apply this change.</KnowledgeText>
      <Button label="Remove" variant="danger" disabled={readOnly} onPress={() => {
        if (readOnly || (confirmRemoval.kind === "specifications" && blocked.has(confirmRemoval.id)) || (confirmRemoval.kind === "brands" && specifications.some(row => isKnowledgeObject(row) && row.brandId === confirmRemoval.id))) return;
        onChange({ ...payload, [confirmRemoval.kind]: (confirmRemoval.kind === "brands" ? brands : specifications).filter(row => !isKnowledgeObject(row) || row.id !== confirmRemoval.id) });
        setConfirmRemoval(null);
      }} />
    </KnowledgeModal> : null}
  </KnowledgeCard>;
}

const styles = StyleSheet.create({
  item: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, gap: 6 },
  itemHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemSummary: { flex: 1, minWidth: 0, gap: 3 },
  itemName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center" },
  brands: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, gap: 4 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }
});
