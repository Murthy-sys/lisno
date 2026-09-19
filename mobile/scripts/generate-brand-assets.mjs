import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../../backend/node_modules/sharp");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mobileRoot, "..");
const outputDir = path.join(mobileRoot, "assets", "brand");
const source = await readFile(path.join(repoRoot, "frontend", "public", "favicon.svg"));
const wordmarkSource = await readFile(path.join(repoRoot, "frontend", "public", "lisno-logo.svg"));
const monochromeSource = Buffer.from(source.toString("utf8").replaceAll("#D5AD18", "#FFFFFF"));
const lightWordmarkSource = Buffer.from(
  wordmarkSource.toString("utf8").replaceAll("#1E183B", "#FFFFFF")
);

await mkdir(outputDir, { recursive: true });

async function renderGlyph(input, size, glyphSize) {
  const glyph = await sharp(input).resize(glyphSize, glyphSize, { fit: "contain" }).png().toBuffer();
  const offset = Math.round((size - glyphSize) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: glyph, left: offset, top: offset }]).png().toBuffer();
}

const foreground = await renderGlyph(source, 1024, 560);
const monochrome = await renderGlyph(monochromeSource, 1024, 560);
const splash = await renderGlyph(source, 512, 300);
const background = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#1E183B" }
}).png().toBuffer();
const legacy = await sharp(background).composite([{ input: foreground }]).png().toBuffer();
const wordmarkLight = await sharp(lightWordmarkSource, { density: 384 })
  .resize(440, 120, { fit: "contain" })
  .png()
  .toBuffer();
const wordmarkDark = await sharp(wordmarkSource, { density: 384 })
  .resize(440, 120, { fit: "contain" })
  .png()
  .toBuffer();

await Promise.all([
  sharp(foreground).toFile(path.join(outputDir, "icon-foreground.png")),
  sharp(monochrome).toFile(path.join(outputDir, "icon-monochrome.png")),
  sharp(splash).toFile(path.join(outputDir, "splash-icon.png")),
  sharp(background).toFile(path.join(outputDir, "icon-background.png")),
  sharp(legacy).toFile(path.join(outputDir, "icon.png")),
  sharp(wordmarkLight).toFile(path.join(outputDir, "wordmark-light.png")),
  sharp(wordmarkDark).toFile(path.join(outputDir, "wordmark-dark.png"))
]);
