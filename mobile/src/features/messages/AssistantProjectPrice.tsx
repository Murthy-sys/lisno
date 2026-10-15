import { Text, View } from "react-native";
import { askLisnoStyles as styles } from "../ask-lisno/askLisnoStyles";
import type { AssistantProjectPricing } from "./assistantAnswerSchema";

const money = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value / 100);

/** Shared display of immutable customer publication amounts, never live rates. */
export function AssistantProjectPrice({ price }: { readonly price: AssistantProjectPricing }) {
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={styles.title}>{price.state === "approved" ? "Approved estimate" : "Published estimate"}</Text>
    <Text style={styles.muted}>Estimate version {price.estimateVersion} · Review version {price.reviewVersion}</Text>
    <Text style={styles.muted}>Source: {price.source.label}</Text>
    {price.lines.map(line => <View key={line.id} style={styles.fact}>
      <Text style={styles.title}>{line.label}</Text>
      <Text style={styles.body}>{line.quantity === null ? "Quantity unavailable" : `${line.quantity}${line.unit ? ` ${line.unit}` : ""}`} · Rate: {money(line.ratePaise)}</Text>
      <Text style={styles.body}>Amount: {money(line.amountPaise)}</Text>
    </View>)}
    {price.hasMoreLines ? <Text style={styles.muted}>Showing {price.lines.length} of {price.lineCount} lines. Open the estimate for all lines.</Text> : null}
    <View style={styles.total}>{(["subtotalPaise", "gstPaise", "totalPaise"] as const).map((key, index) => <Text key={key} style={styles.body}>{["Subtotal before GST", "GST", "Total"][index]}: {money(price[key])}</Text>)}</View>
  </View>;
}
