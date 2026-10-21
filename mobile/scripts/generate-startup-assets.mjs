import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This command intentionally writes only the splash-specific PNG. Shared brand
// and launcher assets remain owned by generate-brand-assets.mjs.
const require = createRequire(import.meta.url);
const sharp = require("../../backend/node_modules/sharp");
const { startupTheme } = require("../src/ui/startupTheme.js");
const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.resolve(mobileRoot, "..", "frontend", "public");
const [favicon, wordmark] = await Promise.all([
  readFile(path.join(publicRoot, "favicon.svg"), "utf8"),
  readFile(path.join(publicRoot, "lisno-logo.svg"), "utf8")
]);

const paths = (source) => [...source.matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);
const symbolPaths = paths(favicon);
const originalPaths = paths(wordmark);
const ink = startupTheme.ink;
const viewBox = favicon.match(/\bviewBox="([\d.\s-]+)"/)?.[1];

if (!/^#[\da-fA-F]{6}$/.test(ink) || !viewBox || symbolPaths.length !== 11 || originalPaths.length !== 16
  || symbolPaths.some((value, index) => value !== originalPaths[index])) {
  throw new Error("Original Lisno symbol paths, view box, or splash ink could not be verified.");
}

const source = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="48" height="48" fill="${ink}">`
  + symbolPaths.map((d) => `<path d="${d}"/>`).join("")
  + "</svg>"
);
const glyph = await sharp(source).resize(300, 300, { fit: "contain" }).png().toBuffer();
const outputDir = path.join(mobileRoot, "assets", "brand");
await mkdir(outputDir, { recursive: true });
await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).composite([{ input: glyph, left: 106, top: 106 }]).png()
  .toFile(path.join(outputDir, "startup-icon-cream.png"));
