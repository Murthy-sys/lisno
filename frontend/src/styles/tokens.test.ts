import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesDirectory = resolve(process.cwd(), "src/styles");

function readStyle(filename: string) {
  const path = resolve(stylesDirectory, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function tokenValue(css: string, name: string) {
  return css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
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
    const tokens = readStyle("tokens.css");

    for (const [name, value] of Object.entries(expectedColors)) {
      expect(tokenValue(tokens, name)).toBe(value);
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
      expect(tokenValue(tokens, name)).toBe(value);
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
    ].forEach((name) => expect(tokenValue(tokens, name)).toBeTruthy());

    expect(tokens.match(/--shadow-[\w-]+:/g)).toHaveLength(3);
  });

  it("keeps the approved foreground and background contrast pairs accessible", () => {
    expect(contrast("#ffffff", "#5a45d6")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#111a39")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#171b2d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#626a7d", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#18795c")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#b33a4a")).toBeGreaterThanOrEqual(4.5);
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
