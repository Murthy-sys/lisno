import { Component, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Heading } from "./primitives";
import { colors, spacing, typography } from "./tokens";

interface FeatureErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onLeave: () => void;
}

interface FeatureErrorBoundaryState {
  readonly hasError: boolean;
}

export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state: FeatureErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): FeatureErrorBoundaryState {
    return { hasError: true };
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.message}>
          <Heading title="This screen couldn't be displayed" />
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>
            Try again to reopen it, or go back to another screen.
          </Text>
          <Text style={styles.body}>Unsaved changes on this screen may be lost.</Text>
          <Button label="Try again" onPress={this.retry} accessibilityHint="Reopens this screen. Unsaved changes may be lost." />
          <Button label="Go back" variant="secondary" onPress={this.props.onLeave} accessibilityHint="Leaves this screen." />
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  message: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.lg },
  body: { color: colors.inkMuted, ...typography.body }
});
