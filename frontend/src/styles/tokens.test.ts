import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesDirectory = resolve(process.cwd(), "src/styles");

function readStyle(filename: string) {
  const path = resolve(stylesDirectory, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function tokenDeclarations(css: string) {
  const rootRules = [...css.matchAll(/:root\s*\{([^{}]*)\}/g)];
  expect(rootRules).toHaveLength(1);
  expect(css.replace(rootRules[0][0], "").trim()).toBe("");

  const declarations = [...rootRules[0][1].matchAll(/^\s*([^:\s]+)\s*:\s*([^;]+);/gm)];
  expect(declarations).not.toHaveLength(0);
  expect(declarations.every(([, name]) => name.startsWith("--"))).toBe(true);
  expect(rootRules[0][1].replace(/^\s*--[\w-]+\s*:\s*[^;]+;/gm, "").trim()).toBe("");

  return new Map(declarations.map(([, name, value]) => [name, value.trim()]));
}

function colorToken(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  if (/^#[\da-f]{6}$/i.test(value)) {
    return value;
  }

  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) {
    return colorToken(tokens, alias[1]);
  }

  const colorMix = value.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+(?:\.\d+)?)%, (white|#[\da-f]{6})\)$/i);
  if (colorMix) {
    const [, source, percentage, destination] = colorMix;
    const sourceChannels = hexToRgb(colorToken(tokens, source));
    const destinationChannels = hexToRgb(destination === "white" ? "#ffffff" : destination);
    const weight = Number(percentage) / 100;
    const mixed = sourceChannels.map((channel, index) => Math.round(channel * weight + destinationChannels[index] * (1 - weight)));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  throw new Error(`${name} must resolve to a hex color`);
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255] as const;
}

function relativeLuminance(hex: string) {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const expectedColors = {
  "--color-brand-midnight": "#111a39",
  "--color-brand-midnight-raised": "#192448",
  "--color-brand-violet": "#5a45d6",
  "--color-brand-violet-bright": "#8e7cff",
  "--color-canvas": "#f4f5fa",
  "--color-surface": "#ffffff",
  "--color-surface-subtle": "#f8f8fc",
  "--color-text": "#171b2d",
  "--color-text-muted": "#626a7d",
  "--color-border": "#dde1eb",
  "--color-border-strong": "#c8cedc",
  "--color-success": "#18795c",
  "--color-warning": "#8a5b12",
  "--color-danger": "#b33a4a",
  "--color-info": "#315ab8",
} as const;

describe("semantic UI foundation", () => {
  it("provides the approved semantic color and foundation token contract", () => {
    const tokens = tokenDeclarations(readStyle("tokens.css"));

    for (const [name, value] of Object.entries(expectedColors)) {
      expect(tokens.get(name)).toBe(value);
    }

    for (const [name, value] of [
      ["--space-1", "4px"],
      ["--space-2", "8px"],
      ["--space-3", "12px"],
      ["--space-4", "16px"],
      ["--space-5", "20px"],
      ["--space-6", "24px"],
      ["--space-7", "32px"],
      ["--space-8", "40px"],
      ["--space-9", "48px"],
      ["--space-10", "64px"],
      ["--radius-control", "10px"],
      ["--radius-field", "14px"],
      ["--radius-surface", "20px"],
      ["--radius-pill", "999px"],
      ["--duration-fast", "140ms"],
      ["--duration-settle", "220ms"],
      ["--duration-overlay", "320ms"],
    ] as const) {
      expect(tokens.get(name)).toBe(value);
    }

    [
      "--ease-standard",
      "--focus-ring-color",
      "--focus-ring",
      "--shadow-soft",
      "--shadow-raised",
      "--shadow-overlay",
      "--font-interface",
      "--font-editorial",
      "--font-tabular",
      "--type-page-title",
      "--type-section-title",
      "--type-body",
      "--type-metadata",
    ].forEach((name) => expect(tokens.get(name)).toBeTruthy());

    expect([...tokens.keys()].filter((name) => name.startsWith("--shadow-"))).toHaveLength(3);
  });

  it("keeps the approved foreground and background contrast pairs accessible", () => {
    const tokens = tokenDeclarations(readStyle("tokens.css"));
    const surface = colorToken(tokens, "--color-surface");

    expect(contrast(surface, colorToken(tokens, "--color-brand-violet"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(surface, colorToken(tokens, "--color-brand-midnight"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorToken(tokens, "--color-text"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorToken(tokens, "--color-text-muted"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(surface, colorToken(tokens, "--color-success"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(surface, colorToken(tokens, "--color-danger"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus indicator distinguishable on every foundation surface", () => {
    const tokens = tokenDeclarations(readStyle("tokens.css"));
    const focus = colorToken(tokens, "--focus-ring-color");

    for (const background of [
      "--color-canvas",
      "--color-surface",
      "--color-brand-midnight"
    ]) {
      expect(contrast(focus, colorToken(tokens, background))).toBeGreaterThanOrEqual(3);
    }
  });

  it("provides reduced-motion protections for transitions and continuous animation", () => {
    const motion = readStyle("motion.css");

    expect(motion).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(motion).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(motion).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(motion).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it("loads foundations in layer order and owns the global focus treatment in base", () => {
    const index = readStyle("index.css");
    const base = readStyle("base.css");
    const foundationImports = [
      "@layer theme, base, components, shell, utilities;",
      '@import "tailwindcss";',
      '@import "./tokens.css" layer(theme);',
      '@import "./base.css" layer(base);',
      '@import "./motion.css" layer(components);',
      '@import "./primitives.css" layer(components);',
      '@import "./shell.css" layer(shell);',
    ].join("\n");

    expect(index.startsWith(foundationImports)).toBe(true);
    expect(index).not.toMatch(/@layer\s+base\s*\{/);
    expect(base).toMatch(/:focus-visible\s*\{[^}]*var\(--focus-ring\)/s);
  });
});
