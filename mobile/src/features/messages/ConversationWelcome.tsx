import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { fonts, spacing } from "../../ui/tokens";
import { chatColors } from "./chatTheme";

export function ConversationWelcome() {
  return (
    <View accessibilityRole="summary" style={styles.container}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.illustration}>
        <Svg height={82} viewBox="0 0 82 82" width={82}>
          <Path d="M19 22h44v31H38L24 64l4-11h-9V22Z" fill="none" stroke="#86A69A" strokeLinejoin="round" strokeWidth="2.4" />
        </Svg>
        <View style={styles.peopleBadge}>
          <Svg height={26} viewBox="0 0 26 26" width={26}>
            <Circle cx="10" cy="9" fill="none" r="4" stroke={chatColors.green} strokeWidth="1.7" />
            <Path d="M3.8 21c.4-4.2 2.5-6.3 6.2-6.3s5.8 2.1 6.2 6.3M16.5 6.5a4 4 0 0 1 0 7.2M17.2 15.5c3 .4 4.6 2.2 5 5.5" fill="none" stroke={chatColors.green} strokeLinecap="round" strokeWidth="1.7" />
          </Svg>
        </View>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Your project, in one conversation</Text>
      <Text style={styles.message}>Select a project to talk with your client and team.{"\n"}Keep questions, updates and decisions together.</Text>
      <Text style={styles.note}>Shared with the people involved in your project.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F9FA", borderBottomWidth: 5, borderBottomColor: "#25A982", padding: spacing.xl, gap: spacing.sm },
  illustration: { width: 136, height: 136, alignItems: "center", justifyContent: "center", borderRadius: 68, backgroundColor: "#E7EFEB", marginBottom: spacing.md },
  peopleBadge: { position: "absolute", right: 5, bottom: 12, width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#FFFFFF" },
  title: { color: "#41525D", fontFamily: fonts.regular, fontSize: 28, lineHeight: 36, letterSpacing: -0.5, textAlign: "center" },
  message: { color: "#667781", fontFamily: fonts.regular, fontSize: 14, lineHeight: 25, textAlign: "center" },
  note: { color: "#6A7A83", fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: spacing.lg }
});
