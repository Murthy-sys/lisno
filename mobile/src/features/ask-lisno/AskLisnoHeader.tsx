import { Pressable, Text, View } from "react-native";
import { useScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { AskLisnoIcon, AskLisnoMark } from "./AskLisnoIcons";
import { askLisnoColors, askLisnoStyles as styles } from "./askLisnoStyles";

export function AskLisnoHeader() {
  const back = useScaffoldContentBack();
  return <View style={styles.header}>
    {back?.visible ? <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled: back.disabled }} disabled={back.disabled} onPress={back.onBack} style={({ pressed }) => [styles.back, back.disabled && styles.disabled, pressed && !back.disabled && styles.pressed]}><AskLisnoIcon name="back" size={25} color={askLisnoColors.ink} /></Pressable> : <View style={styles.back} />}
    <AskLisnoMark />
    <View style={styles.grow}><Text accessibilityRole="header" style={styles.heading}>Ask Lisno</Text><Text style={styles.subtitle}>Your project assistant</Text></View>
  </View>;
}
