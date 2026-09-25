import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button as BaseButton, Field as BaseField } from "../../ui/primitives";
import { colors } from "../../ui/tokens";
import { knowledgeDetailStyles } from "./knowledgeUi";

export { KnowledgeCard, KnowledgeChoice, KnowledgeDetailProvider, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeDetailStyles as knowledgeStyles } from "./knowledgeUi";
export function Button(props: ComponentProps<typeof BaseButton>) { return <BaseButton {...props} size="compact" />; }
export function Field(props: ComponentProps<typeof BaseField>) { return <BaseField {...props} compact />; }

export function DetailIcon({ name, size = 18 }: { readonly name: "back" | "edit" | "add" | "close" | "down" | "right" | "more"; readonly size?: number }) {
  const paths = { back: "m10 5-7 7 7 7M3 12h17", edit: "m4 15 11-11 5 5L9 20l-6 1 1-6Zm9-9 5 5", add: "M12 4v16M4 12h16", close: "m6 6 12 12M18 6 6 18", down: "m6 9 6 6 6-6", right: "m9 6 6 6-6 6", more: "M5 12h.01M12 12h.01M19 12h.01" };
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={name === "more" ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={paths[name]} /></Svg></View>;
}

export function IconButton({ label, icon, onPress, disabled = false }: { readonly label: string; readonly icon: ComponentProps<typeof DetailIcon>["name"]; readonly onPress: () => void; readonly disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[local.iconButton, disabled && { opacity: .45 }]}><DetailIcon name={icon} /></Pressable>;
}

export function KnowledgeDisclosure({ title, summary, children, initiallyOpen = false }: { readonly title: string; readonly summary?: string; readonly children: ReactNode; readonly initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={local.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={local.disclosureHeading}>
      <View style={{ flex: 1 }}><Text style={knowledgeDetailStyles.title}>{title}</Text>{summary ? <Text style={knowledgeDetailStyles.text}>{summary}</Text> : null}</View><DetailIcon name={open ? "down" : "right"} size={16} />
    </Pressable>
    {open ? <View style={local.disclosureBody}>{children}</View> : null}
  </View>;
}
const local = StyleSheet.create({
  iconButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 5 },
  disclosure: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface },
  disclosureHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  disclosureBody: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 }
});
