import { AssistantProjectPrice } from "../messages/AssistantProjectPrice";
import { Pressable, Text, View } from "react-native";
import { askLisnoStyles as styles } from "./askLisnoStyles";
import type { AskLisnoProjectChoice, AskLisnoResponse } from "./askLisnoApi";
import type { AskLisnoTurn } from "./useAskLisno";


/** Stable references disambiguate projects even when both name and location match. */
export function projectChoiceLabels(items: readonly AskLisnoProjectChoice[]) {
  const normalize = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return items.map(item => {
    const peers = items.filter(other => normalize(other.name) === normalize(item.name) && normalize(other.detail) === normalize(item.detail));
    let suffix = 8;
    while (suffix < Math.max(...peers.map(peer => peer.id.length)) && new Set(peers.map(peer => peer.id.slice(-suffix))).size < peers.length) suffix += 1;
    return { ...item, reference: peers.length > 1 ? `Reference ${item.id.slice(-suffix)}` : null };
  });
}

function AnswerContent({ response }: { readonly response: AskLisnoResponse }) {
  const answer = response.answer;
  if (answer.disclosurePolicy !== "project-publication-v1") return <Text style={styles.body}>This answer needs to be refreshed. Ask Lisno again for current information.</Text>;
  return <View style={styles.stack}>
    {response.resolution?.project ? <Text style={styles.title}>{response.resolution.project.name}</Text> : null}
    {answer.narrative?.map((paragraph, index) => <Text style={styles.body} key={index}>{paragraph.text}</Text>)}
    {answer.facts.map(fact => <View style={styles.fact} key={fact.id}>
      <Text style={styles.body}>{fact.label}: {fact.value}</Text><Text style={styles.muted}>Source: {fact.source.label}</Text>
    </View>)}
    {answer.missingInputs.map((value, index) => <Text style={styles.body} key={index}>Details needed: {value}</Text>)}
    {answer.projectPricing ? <AssistantProjectPrice price={answer.projectPricing} /> : null}
    {answer.kind === "price" && !answer.projectPricing ? <Text style={styles.body}>Published estimate details are unavailable. Ask Lisno again to check the latest information.</Text> : null}
    {(answer.kind === "handoff" || answer.kind === "no_answer" && !answer.narrative?.length) ? <Text style={styles.body}>Your project team needs to confirm this request.</Text> : null}
  </View>;
}

export function AskLisnoAnswer({ turn, disabled, canChoose, paging, onChoose, onProject, onLoad, onRefreshPrice }: {
  readonly turn: AskLisnoTurn; readonly disabled: boolean; readonly canChoose: boolean; readonly paging: boolean;
  readonly onChoose: (id: string) => void; readonly onProject: (id: string, name: string) => void; readonly onLoad: (refresh: boolean) => void; readonly onRefreshPrice: () => void;
}) {
  const response = turn.response;
  if (!response) return null;
  return <View style={styles.answer}>
    {turn.listChanged ? <Text style={styles.body}>Your project list has changed. Refresh it to see the current projects.</Text> : response.resolution?.state === "clarification" ? <View style={styles.stack}>
      <Text style={styles.body}>{response.resolution.question ?? "Which project would you like to discuss?"}</Text>
      {projectChoiceLabels(response.resolution.choices).map(choice => <Pressable key={choice.id} accessibilityRole="button" accessibilityLabel={`Choose ${choice.name}${choice.detail ? `, ${choice.detail}` : ""}${choice.reference ? `, ${choice.reference}` : ""}`} accessibilityState={{ disabled: disabled || !canChoose }} disabled={disabled || !canChoose} onPress={() => onChoose(choice.id)} style={[styles.option, (disabled || !canChoose) && styles.disabled]}>
        <Text style={styles.title}>{choice.name}</Text>{choice.detail ? <Text style={styles.muted}>{choice.detail}</Text> : null}{choice.reference ? <Text style={styles.muted}>{choice.reference}</Text> : null}
      </Pressable>)}
    </View> : <AnswerContent response={response} />}
    {response.projectList ? <View accessibilityLabel="Your projects" style={styles.stack}>
      {projectChoiceLabels(response.projectList.items).map(project => <Pressable key={project.id} accessibilityRole="button" accessibilityLabel={`View progress for ${project.name}${project.detail ? `, ${project.detail}` : ""}${project.reference ? `, ${project.reference}` : ""}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => onProject(project.id, project.name)} style={[styles.option, disabled && styles.disabled]}>
        <Text style={styles.title}>{project.name}</Text>{project.detail ? <Text style={styles.muted}>{project.detail}</Text> : null}{project.reference ? <Text style={styles.muted}>{project.reference}</Text> : null}<Text style={styles.muted}>View progress</Text>
      </Pressable>)}
      {turn.listError ? <Text accessibilityRole="alert" style={styles.error}>{turn.listError}</Text> : null}
      {paging ? <Text accessibilityLiveRegion="polite" style={styles.muted}>Loading projects…</Text> : null}
      {turn.listChanged || response.projectList.nextOffset !== null ? <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={({ pressed }) => [styles.option, disabled && styles.disabled, pressed && !disabled && styles.pressed]} onPress={() => onLoad(Boolean(turn.listChanged))}><Text style={styles.body}>{turn.listChanged ? "Refresh projects" : turn.listError ? "Retry loading projects" : "Show more projects"}</Text></Pressable> : null}
    </View> : null}
    {turn.pricingNeedsRefresh ? <View style={styles.stack}><Text style={styles.muted}>Estimate details need a fresh check.</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh estimate" accessibilityState={{ disabled }} disabled={disabled} style={styles.option} onPress={onRefreshPrice}><Text style={styles.body}>Refresh estimate</Text></Pressable></View> : null}
    <Text style={styles.muted}>Checked {new Date(response.checkedAt).toLocaleString()}</Text>
  </View>;
}
