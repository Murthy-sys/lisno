import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import type { EstimationCatalogue } from "./catalogueTypes";
import { configuredLineAmountPaise, configuredModeBaseRate, deselectConfiguredRecommendationSources, estimatePricingModeLabels, formatRateInput, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimateClassification, EstimatePricingMode } from "./types";
import { estimatePaise, type StaffEstimateForm } from "./staffEstimateModel";
import { EstimateChoice, EstimateSection, EstimateSelect, EstimateText, estimateStyles as styles } from "./EstimateUI";

function NumberField({ label, value, onChange, disabled }: { readonly label: string; readonly value: number; readonly onChange: (value: number) => void; readonly disabled: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(Number.isNaN(value) ? "" : String(value)); }, [value]);
  return <Field label={label} value={text} keyboardType="decimal-pad" editable={!disabled} onChangeText={(next) => { setText(next); onChange(next.trim() ? Number(next) : 0); }} />;
}
export function EstimateBasketSelection({ form, catalogue, disabled, onChange }: { readonly form: StaffEstimateForm; readonly catalogue: EstimationCatalogue; readonly disabled: boolean; readonly onChange: (form: StaffEstimateForm) => void }) {
  const [search, setSearch] = useState("");
  return <EstimateSection title="Select scope">
    <Field label="Search Main Baskets" value={search} onChangeText={setSearch} />
    {catalogue.ineligibleLineCount ? <EstimateText>{catalogue.ineligibleLineCount} items are unavailable until Configuration is complete.</EstimateText> : null}
    {!catalogue.items.length ? <EstimateText>No configured baskets are available.</EstimateText> : null}
    {catalogue.items.filter((basket) => basket.name.toLowerCase().includes(search.toLowerCase())).map((basket) => <View key={basket.id} style={styles.stack}>
      <EstimateChoice label={basket.name} multiple selected={form.selectedMainBasketIds.includes(basket.id)} disabled={disabled} onPress={() => {
        const selected = form.selectedMainBasketIds.includes(basket.id);
        onChange({ ...form, selectedMainBasketIds: selected ? form.selectedMainBasketIds.filter((id) => id !== basket.id) : [...form.selectedMainBasketIds, basket.id],
          lines: selected ? deselectConfiguredRecommendationSources(form.lines.filter((line) => line.mainBasketId !== basket.id), new Set(form.lines.filter((line) => line.mainBasketId === basket.id).map((line) => line.key))) : form.lines });
      }} />
      {basket.description ? <EstimateText>{basket.description}</EstimateText> : null}
      {form.selectedMainBasketIds.includes(basket.id) ? <EstimateSelect label={`${basket.name} classification`} value={form.classifications[basket.id] ?? "standard"} allowEmpty={false} disabled={disabled} options={[{ value: "standard", label: "Standard" }, { value: "special", label: "Special" }]} onChange={(value) => onChange({ ...form, classifications: { ...form.classifications, [basket.id]: value as EstimateClassification } })} /> : null}
    </View>)}
  </EstimateSection>;
}
export function EstimateItemEditor({ form, activeRoomId, onRoomChange, disabled, onChange }: { readonly form: StaffEstimateForm; readonly activeRoomId: string; readonly onRoomChange: (roomId: string) => void; readonly disabled: boolean; readonly onChange: (form: StaffEstimateForm) => void }) {
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const room = form.rooms.find((item) => item.id === activeRoomId) ?? form.rooms[0];
  const lines = form.lines.filter((line) => line.roomId === room?.id && (!selectedOnly || line.included) && [line.mainLineName, line.mainBasketName, line.subBasketName].some((value) => value?.toLowerCase().includes(search.toLowerCase())));
  function update(line: ConfiguredLineDraft, change: Partial<ConfiguredLineDraft>) {
    const next = change.included === false ? deselectConfiguredRecommendationSources(form.lines, new Set([line.key])) : form.lines.map((item) => item.key === line.key ? updateConfiguredLinePricing(item, change, form.classifications[line.mainBasketId] ?? "standard") : item);
    onChange({ ...form, lines: next });
  }
  return <View style={styles.stack}>
    <EstimateSelect label="Estimate room" value={room?.id ?? ""} options={form.rooms.map((item) => ({ value: item.id, label: item.label }))} allowEmpty={false} onChange={onRoomChange} />
    <Field label="Search estimate items" value={search} onChangeText={setSearch} />
    <EstimateChoice label="Show selected items only" multiple selected={selectedOnly} onPress={() => setSelectedOnly(!selectedOnly)} />
    {!lines.length && !form.legacyLines.length ? <EstimateText>No matching items. Select rooms and Main Baskets first.</EstimateText> : null}
    {lines.map((line) => {
      const classification = line.classification ?? form.classifications[line.mainBasketId] ?? "standard";
      return <EstimateSection key={line.key} title={line.mainLineName}>
        <EstimateText>{line.mainBasketName}{line.subBasketName ? ` / ${line.subBasketName}` : ""} · {line.itemType === "temporary" ? "Temporary item" : "Main Line"} · {line.uomName}</EstimateText>
        {line.sourceMissing ? <EstimateText error>Current Configuration is unavailable or this item's basket changed. Remove it or refresh Configuration before saving.</EstimateText> : <EstimateChoice label={`Include ${line.mainLineName}`} multiple selected={line.included} disabled={disabled} onPress={() => update(line, { included: !line.included })} />}
        {line.included && !line.sourceMissing ? <>
          <EstimateSelect label={`${line.mainLineName} type`} value={classification} allowEmpty={false} disabled={disabled} options={[{ value: "standard", label: "Standard" }, { value: "special", label: "Special" }]} onChange={(value) => update(line, { classification: value as EstimateClassification })} />
          {classification === "special" ? <EstimateSelect label={`${line.mainLineName} pricing mode`} value={line.pricingMode ?? ""} allowEmpty={false} disabled={disabled} options={Object.entries(estimatePricingModeLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => update(line, { pricingMode: value as EstimatePricingMode })} /> : <EstimateText>Standard · Sub-Vendor pricing</EstimateText>}
          <NumberField label={`${line.mainLineName} quantity (${line.uomName})`} value={line.quantity} disabled={disabled} onChange={(quantity) => update(line, { quantity })} />
          {line.uomNeedsQuantityReview ? <><EstimateText error>The unit changed from {line.previousUomName ?? "the previous unit"} to {line.uomName}. Review and confirm the quantity.</EstimateText><Button label={`Confirm ${line.mainLineName} quantity`} disabled={disabled} onPress={() => update(line, { uomNeedsQuantityReview: false })} /></> : null}
          <Field label={`${line.mainLineName} selling rate (₹)`} value={line.rateInput} keyboardType="decimal-pad" editable={!disabled} onChangeText={(rateInput) => update(line, { rateInput })} />
          <EstimateText>Rate source: {line.rateSource === "configuration" ? "Configuration" : "Manual"}. Amount: {estimatePaise(configuredLineAmountPaise(line))}</EstimateText>
          <Button label={`Use Configuration rate for ${line.mainLineName}`} variant="quiet" disabled={disabled || !line.pricingMode} onPress={() => onChange({ ...form, lines: form.lines.map((item) => item.key === line.key ? { ...item, rateSource: "configuration", rateInput: formatRateInput(configuredModeBaseRate(item, item.pricingMode!)) } : item) })} />
          {line.estimateNotes?.map((note, index) => <EstimateText key={index}>{note}</EstimateText>)}
        </> : null}
        {line.persistedId || line.sourceMissing ? <Button label={`Remove saved ${line.mainLineName}`} variant="quiet" disabled={disabled} onPress={() => onChange({ ...form, lines: form.lines.filter((item) => item.key !== line.key) })} /> : null}
      </EstimateSection>;
    })}
    {form.legacyLines.map((line, index) => ({ line, index })).filter(({ line }) => line.roomName === room?.label).map(({ line, index }) => <EstimateSection key={line.id ?? `${line.catalogueId}:${index}`} title={line.specification}>
      <EstimateText>Historical item · {line.roomName} · {line.unit}</EstimateText>
      <EstimateChoice label={`Include historical item ${index + 1}`} multiple selected={line.included} disabled={disabled} onPress={() => onChange({ ...form, legacyLines: form.legacyLines.map((item, at) => at === index ? { ...item, included: !item.included } : item) })} />
      <NumberField label={`Historical item ${index + 1} quantity`} value={line.quantity} disabled={disabled} onChange={(quantity) => onChange({ ...form, legacyLines: form.legacyLines.map((item, at) => at === index ? { ...item, quantity } : item) })} />
      <NumberField label={`Historical item ${index + 1} rate`} value={line.rate} disabled={disabled} onChange={(rate) => onChange({ ...form, legacyLines: form.legacyLines.map((item, at) => at === index ? { ...item, rate } : item) })} />
      <Field label={`Historical item ${index + 1} specification`} value={line.specification} editable={!disabled} onChangeText={(specification) => onChange({ ...form, legacyLines: form.legacyLines.map((item, at) => at === index ? { ...item, specification } : item) })} />
    </EstimateSection>)}
  </View>;
}
