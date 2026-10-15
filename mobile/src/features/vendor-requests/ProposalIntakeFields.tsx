import { View } from "react-native";
import { Button, Field, KnowledgeText, knowledgeStyles as s } from "../knowledge/knowledgeDetailUi";
import type { ProposalIntakeContent } from "./proposalTypes";

export const emptyIntake = (sub: boolean): ProposalIntakeContent => ({ ...(!sub ? { basket: { name: "", description: "" } } : {}), subBasket: { name: "", description: "" }, mainLines: [{ name: "" }] });
const name = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
export function normalizeIntake(value: ProposalIntakeContent): ProposalIntakeContent { return { ...(value.basket ? { basket: { name: name(value.basket.name), description: value.basket.description?.trim() || null } } : {}), subBasket: { name: name(value.subBasket.name), description: value.subBasket.description?.trim() || null }, mainLines: value.mainLines.map(line => ({ ...line, name: name(line.name) })) }; }
export function intakeProblem(value: ProposalIntakeContent, complete: boolean): string {
  if (value.basket && !value.basket.name.trim()) return "Enter a Main Basket name.";
  if (!value.subBasket.name.trim()) return "Enter a Sub Basket name.";
  if (complete && ((value.basket && !value.basket.description?.trim()) || !value.subBasket.description?.trim())) return "Add the Main Basket and Sub Basket descriptions before sending for approval.";
  if (value.mainLines.some(line => !line.name.trim()) || (complete && !value.mainLines.length)) return "Enter at least one Main Line name; remove any empty rows.";
  if (new Set(value.mainLines.map(line => name(line.name).toLowerCase())).size !== value.mainLines.length) return "Main Line names must be unique within this request.";
  return "";
}
export function ProposalIntakeFields({ value, parentName, disabled, onChange }: { value: ProposalIntakeContent; parentName?: string; disabled: boolean; onChange: (value: ProposalIntakeContent) => void }) {
  return <View style={s.stack}>
    {value.basket ? <><Field label="Main Basket name" value={value.basket.name} maxLength={240} editable={!disabled} onChangeText={name => onChange({ ...value, basket: { ...value.basket!, name } })} /><Field label="Main Basket description" value={value.basket.description ?? ""} maxLength={4000} multiline editable={!disabled} onChangeText={description => onChange({ ...value, basket: { ...value.basket!, description } })} /></> : <KnowledgeText>Selected Main Basket: {parentName ?? "Unavailable Main Basket"}</KnowledgeText>}
    <Field label="Sub Basket name" value={value.subBasket.name} maxLength={240} editable={!disabled} onChangeText={name => onChange({ ...value, subBasket: { ...value.subBasket, name } })} />
    <Field label="Sub Basket description" value={value.subBasket.description ?? ""} maxLength={4000} multiline editable={!disabled} onChangeText={description => onChange({ ...value, subBasket: { ...value.subBasket, description } })} />
    <KnowledgeText>List the Main Line names. Super Admin configures their units, rates and other details.</KnowledgeText>
    {value.mainLines.map((line, index) => <View style={s.stack} key={line.resourceId ?? index}><Field label={`Main Line ${index + 1} name`} value={line.name} maxLength={240} editable={!disabled} onChangeText={name => onChange({ ...value, mainLines: value.mainLines.map((entry, at) => at === index ? { ...entry, name } : entry) })} />{!disabled ? <Button label={`Remove Main Line ${index + 1}`} variant="quiet" onPress={() => onChange({ ...value, mainLines: value.mainLines.filter((_, at) => at !== index) })} /> : null}</View>)}
    {!disabled ? <Button label="Add Main Line" variant="secondary" disabled={value.mainLines.length >= 100} onPress={() => onChange({ ...value, mainLines: [...value.mainLines, { name: "" }] })} /> : null}
  </View>;
}
