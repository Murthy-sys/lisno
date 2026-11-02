import { useState, type Dispatch, type SetStateAction } from "react";

export interface ConfiguredEstimateViewState {
  search: string;
  basketFilter: string;
  railView: "section" | "selected";
  collapsedBasketIds: Set<string>;
  collapsedSubBasketIds: Set<string>;
}

export const createConfiguredEstimateViewState = (): ConfiguredEstimateViewState => ({
  search: "", basketFilter: "all", railView: "section",
  collapsedBasketIds: new Set(), collapsedSubBasketIds: new Set()
});

/** The workspace may retain navigation while a frozen revision replaces the builder. */
export function useConfiguredEstimateViewState(
  controlled?: ConfiguredEstimateViewState,
  onChange?: Dispatch<SetStateAction<ConfiguredEstimateViewState>>
) {
  const [local, setLocal] = useState(createConfiguredEstimateViewState);
  const state = controlled ?? local;
  const update = onChange ?? setLocal;
  const field = <K extends keyof ConfiguredEstimateViewState>(key: K) => (value: SetStateAction<ConfiguredEstimateViewState[K]>) =>
    update(current => ({ ...current, [key]: typeof value === "function"
      ? (value as (previous: ConfiguredEstimateViewState[K]) => ConfiguredEstimateViewState[K])(current[key]) : value }));
  return { ...state, setSearch: field("search"), setBasketFilter: field("basketFilter"), setRailView: field("railView"),
    setCollapsedBasketIds: field("collapsedBasketIds"), setCollapsedSubBasketIds: field("collapsedSubBasketIds") };
}
