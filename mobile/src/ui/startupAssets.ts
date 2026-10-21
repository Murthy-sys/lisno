import type { ImageSourcePropType } from "react-native";

/** Bundled cutouts share a square canvas so their native rotation bounds are predictable. */
export const startupAssets = {
  interior: {
    source: require("../../assets/brand/startup/interior.png") as number,
    width: 512,
    height: 512
  },
  plan: {
    source: require("../../assets/brand/startup/plan.png") as number,
    width: 512,
    height: 512
  },
  materials: {
    source: require("../../assets/brand/startup/materials.png") as number,
    width: 512,
    height: 512
  },
  tools: {
    source: require("../../assets/brand/startup/tools.png") as number,
    width: 512,
    height: 512
  }
} as const satisfies Record<string, {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
}>;

/** Metro module IDs accepted by Expo Asset.loadAsync; no remote image request is needed. */
export const startupAssetModules = Object.values(startupAssets).map((asset) => asset.source);
