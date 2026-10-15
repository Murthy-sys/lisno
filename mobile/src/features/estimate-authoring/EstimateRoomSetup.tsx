import { useState } from "react";
import { Alert, View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { getEstimateRoomDefinitions, mergeSelectedRoomDefinitions, parseBedroomCount, requiresBedroomCount } from "./estimateRoomOptions";
import { propertyTypes } from "./propertyTypes";
import type { StaffEstimateForm } from "./staffEstimateModel";
import { EstimateChoice, EstimateSection, EstimateSelect, EstimateText, estimateStyles as styles } from "./EstimateUI";

export function EstimateRoomSetup({ form, disabled, onChange }: { readonly form: StaffEstimateForm; readonly disabled: boolean; readonly onChange: (form: StaffEstimateForm) => void }) {
  const [search, setSearch] = useState("");
  const options = mergeSelectedRoomDefinitions(getEstimateRoomDefinitions(form.propertyType, parseBedroomCount(form.bedroomCount)), form.rooms);
  function remove(typeId: string) {
    const removed = form.rooms.filter((room) => room.typeId === typeId);
    Alert.alert("Remove this room?", "The room dimensions and estimate items in this room will be removed from this draft.", [
      { text: "Keep room", style: "cancel" }, { text: "Remove room", style: "destructive", onPress: () => onChange({ ...form,
        rooms: form.rooms.filter((room) => room.typeId !== typeId), lines: form.lines.filter((line) => !removed.some((room) => room.id === line.roomId)),
        legacyLines: form.legacyLines.filter((line) => !removed.some((room) => room.label === line.roomName)) }) }
    ]);
  }
  return <View style={styles.stack}>
    <EstimateSection title="Property and rooms">
      <EstimateSelect label="Property type" value={form.propertyType} options={[...propertyTypes, ...(propertyTypes.some((type) => type === form.propertyType) ? [] : form.propertyType ? [form.propertyType] : [])].map((value) => ({ value, label: value }))} allowEmpty={false} disabled={disabled} onChange={(propertyType) => onChange({ ...form, propertyType, bedroomCount: "" })} />
      {requiresBedroomCount(form.propertyType) ? <Field label="Number of bedrooms" value={form.bedroomCount} keyboardType="number-pad" editable={!disabled} onChangeText={(bedroomCount) => onChange({ ...form, bedroomCount })} /> : null}
      <EstimateText>Choose each required room. Bedroom balconies and bathrooms are optional. Previously selected rooms remain until you remove them.</EstimateText>
      <Field label="Search rooms" value={search} onChangeText={setSearch} />
      {["Common Areas", "Bedrooms", "Bathrooms", "Other", "Previously selected"].map((group) => {
        const visible = options.filter((option) => option.group === group && option.label.toLowerCase().includes(search.toLowerCase()));
        return visible.length ? <View key={group} style={styles.stack}><EstimateText>{group}</EstimateText>{visible.map((option) => <EstimateChoice key={option.typeId} label={option.label} multiple selected={form.rooms.some((room) => room.typeId === option.typeId)} disabled={disabled} onPress={() => {
          if (form.rooms.some((room) => room.typeId === option.typeId)) remove(option.typeId);
          else onChange({ ...form, rooms: [...form.rooms, { id: createIdempotencyKey(), typeId: option.typeId, label: option.label, sqft: option.sqft, length: "", width: "" }] });
        }} />)}</View> : null;
      })}
    </EstimateSection>
    {form.rooms.map((room) => <EstimateSection key={room.id} title={room.label}>
      {room.typeId === "custom" ? <Field label="Custom room name" value={room.label} editable={!disabled} onChangeText={(label) => onChange({ ...form, rooms: form.rooms.map((item) => item.id === room.id ? { ...item, label } : item), lines: form.lines.map((line) => line.roomId === room.id ? { ...line, roomName: label } : line), legacyLines: form.legacyLines.map((line) => line.roomName === room.label ? { ...line, roomName: label } : line) })} /> : null}
      <View style={styles.row}>{(["length", "width"] as const).map((key) => <View key={key} style={styles.column}><Field label={`${room.label} ${key} (ft)`} value={room[key]} keyboardType="decimal-pad" editable={!disabled} onChangeText={(value) => onChange({ ...form, rooms: form.rooms.map((item) => item.id === room.id ? { ...item, [key]: value } : item) })} /></View>)}</View>
      <Button label={`Remove ${room.label}`} variant="quiet" disabled={disabled} onPress={() => remove(room.typeId)} />
    </EstimateSection>)}
  </View>;
}
