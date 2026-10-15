import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../ui/tokens";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, StateView } from "../../ui/primitives";
import { ProcurementProject } from "./ProcurementProject";
import { ProcurementBasketsPanel } from "./ProcurementBasketsPanel";
import { ProcurementItemsPanel } from "./ProcurementItemsPanel";
import { ProcurementOrdersPanel } from "./ProcurementOrdersPanel";
import { ProcurementSuggestionsPanel } from "./ProcurementSuggestionsPanel";
import { CommandFeedback, money, p, Panel, QueryState, useProcurementCommand, useProcurementContext, type ProcurementContext } from "./procurementNative";
interface ProjectSpend { projectId: string; projectName: string; sections: Array<{ id: string; label: string; estimatedAmountPaise: number; actualSpendPaise: number; items: Array<{ key: string; roomName: string; specification: string; estimatedAmountPaise: number; actualSpendPaise: number; expenses: Array<{ id: string; projectId: string; description: string; amountPaise: number; status: string; incurredAt: string; supportingDocument: { originalFilename: string; mimeType: string; sizeBytes: number } | null }> }> }> }
export function ProcurementProjectWorkspace({ projectId, session, onRefresh, embedded = false }: { projectId: string; session: AuthenticatedSession; onRefresh?: () => void; embedded?: boolean }) {
  const c = useProcurementContext(session);
  return <ProjectWorkspace key={`${c.scope}:${projectId}`} context={c} projectId={projectId} embedded={embedded} {...(onRefresh ? { onRefresh } : {})} />;
}
function ProjectWorkspace({ context: c, projectId, onRefresh, embedded }: { context: ProcurementContext; projectId: string; onRefresh?: () => void; embedded: boolean }) {
  const choices = [{ id: "baskets", label: "Baskets and sourcing", allowed: c.can("GET /procurement/projects/:projectId/baskets") }, { id: "orders", label: "Orders and approvals", allowed: c.can("GET /procurement/projects/:projectId/purchase-orders") }, { id: "items", label: "Project items", allowed: c.can("GET /procurement/projects/:projectId/items") }, { id: "suggestions", label: "Vendor suggestions", allowed: c.can("GET /procurement/projects/:projectId/vendor-suggestions") }, { id: "expenses", label: "Recorded expenses", allowed: c.can("GET /procurement/projects") }].filter(choice => choice.allowed);
  const [tab, setTab] = useState(choices[0]?.id ?? "");
  if (!choices.length) return <StateView title="Procurement unavailable" message="No procurement workspace is available for your account." tone="denied" />;
  const active = choices.some(choice => choice.id === tab) ? tab : choices[0]!.id;
  const content = <><View style={tabStyles.heading}><Text style={tabStyles.eyebrow}>PROCUREMENT WORKSPACE</Text><Text accessibilityRole="header" style={p.title}>Project procurement</Text><Text style={tabStyles.description}>Manage sourcing, orders and project spend.</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} style={tabStyles.tabStrip} contentContainerStyle={tabStyles.tabs} accessibilityRole="tablist" accessibilityLabel="Project procurement sections">{choices.map(choice => <Pressable key={choice.id} accessibilityRole="tab" accessibilityLabel={choice.label} accessibilityState={{ selected: active === choice.id, disabled: c.locked }} disabled={c.locked} onPress={() => c.navigate(() => setTab(choice.id))} style={[tabStyles.tab, active === choice.id && tabStyles.selected]}><Text style={[tabStyles.label, active === choice.id && tabStyles.selectedLabel]}>{choice.label}</Text></Pressable>)}</ScrollView>{active === "baskets" ? <ProcurementBasketsPanel context={c} projectId={projectId} /> : null}{active === "orders" ? <ProcurementOrdersPanel context={c} projectId={projectId} /> : null}{active === "items" ? <ProcurementItemsPanel context={c} projectId={projectId} /> : null}{active === "suggestions" ? <ProcurementSuggestionsPanel context={c} projectId={projectId} /> : null}{active === "expenses" ? <ProcurementExpenses context={c} projectId={projectId} /> : null}<Button label="Refresh project procurement" variant="quiet" disabled={c.locked} onPress={() => { if (c.locked) return; void c.refresh(); onRefresh?.(); }} /></>;
  return embedded ? <View style={p.stack}>{content}</View> : <ScrollView contentContainerStyle={p.screen} keyboardShouldPersistTaps="handled">{content}</ScrollView>;
}
function ProcurementExpenses({ context: c, projectId }: { context: ProcurementContext; projectId: string }) {
  const query = useQuery({ queryKey: c.key("projects", "expenses"), queryFn: () => c.http.get<ProjectSpend[]>("/procurement/projects"), retry: false });
  const command = useProcurementCommand(async () => undefined); const project = query.data?.find(value => value.projectId === projectId);
  return <View style={p.stack}><QueryState query={query} title="Recorded expenses" />{query.isSuccess && !project ? <StateView title="Project unavailable" message="This project is not in your current procurement scope." tone="denied" /> : null}{project && !query.isError ? <><ProcurementProject procurementContext={c} projectId={projectId} session={c.session} data={project.sections.flatMap(section => section.items.map(item => ({ ...item, id: item.key, sourceLineItemKey: item.key, name: `${item.roomName} · ${item.specification}` })))} onRefresh={() => void query.refetch()} />{project.sections.map(section => <Panel key={section.id} title={section.label}><Text style={p.copy}>Estimate {money(section.estimatedAmountPaise)} · Recorded spend {money(section.actualSpendPaise)}</Text>{section.items.map(item => <View key={item.key} style={p.stack}><Text style={p.strong}>{item.roomName} · {item.specification}</Text>{item.expenses.filter(expense => expense.projectId === projectId).map(expense => <View key={expense.id} style={p.panel}><Text style={p.copy}>{expense.description} · {money(expense.amountPaise)} · {expense.status} · {new Date(expense.incurredAt).toLocaleDateString()}</Text>{expense.supportingDocument && c.can("GET /procurement/projects/:projectId/entries/:entryId/document") ? <Button label={`Open receipt: ${expense.supportingDocument.originalFilename}`} variant="secondary" disabled={command.locked} onPress={() => void command.execute(async () => { const document = expense.supportingDocument!; const file = await c.transfers.download({ path: `/procurement/projects/${encodeURIComponent(projectId)}/entries/${encodeURIComponent(expense.id)}/document`, fileName: document.originalFilename, mimeType: document.mimeType, maxBytes: 25 * 1024 * 1024 }).result; try { await file.share(); } finally { await file.release(); } }, undefined, false)} /> : <Text style={p.copy}>No accessible supporting document</Text>}</View>)}</View>)}</Panel>)}</> : null}<CommandFeedback command={command} /></View>;
}

const tabStyles = StyleSheet.create({
  heading: { gap: 4 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 16, letterSpacing: 1.4, color: colors.inkMuted },
  description: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: colors.inkMuted },
  tabStrip: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { gap: 24 },
  tab: { minHeight: 48, justifyContent: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  selected: { borderBottomColor: colors.primary },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 21, color: colors.inkMuted },
  selectedLabel: { color: colors.primary, fontFamily: fonts.semibold }
});
