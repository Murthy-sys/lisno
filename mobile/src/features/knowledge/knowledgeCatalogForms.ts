import { Alert } from "react-native";
import { ApiError } from "../../core/http/apiClient";

export function closeCatalogDraft(dirty: boolean, close: () => void) {
  if (!dirty) return close();
  Alert.alert("Discard changes?", "Your unsaved changes will be lost.", [
    { text: "Keep editing", style: "cancel" },
    { text: "Discard changes", style: "destructive", onPress: close }
  ]);
}

export function catalogError(error: unknown): string {
  if (error instanceof ApiError && error.code === "VERSION_CONFLICT") return "This record changed elsewhere. Close this form, refresh, and review the latest version before editing again.";
  if (error instanceof ApiError && error.status === 403) return "Your current access does not allow this action.";
  return error instanceof Error ? error.message : "The action could not be completed. Try again.";
}
