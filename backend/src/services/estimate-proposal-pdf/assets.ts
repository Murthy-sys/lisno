import { readFile } from "node:fs/promises";
import sharp from "sharp";

export const photoNames = ["cover-living", "welcome-detail", "scope-kitchen", "price-living", "workflow-wardrobe", "closing-kitchen"] as const;
export type ProposalPhoto = typeof photoNames[number];
export type ProposalFont = "body" | "medium" | "heading" | "fallback";
export interface ProposalAssets {
  photos: Record<ProposalPhoto, Buffer>;
  fonts: Record<ProposalFont, Buffer>;
  logo: Buffer;
}
const asset = (name: string) => readFile(new URL(`../../assets/estimate-proposal/${name}`, import.meta.url));
let packaged: Promise<Omit<ProposalAssets, "logo">> | undefined;

export async function loadProposalAssets(logoSvg?: Buffer): Promise<ProposalAssets> {
  packaged ??= (async () => {
    const photos = Object.fromEntries(await Promise.all(photoNames.map(async name => {
      const bytes = await asset(`${name}.jpg`);
      const meta = await sharp(bytes).metadata();
      if (meta.format !== "jpeg" || !meta.width || !meta.height) throw new Error("A proposal photograph is invalid.");
      return [name, bytes];
    }))) as ProposalAssets["photos"];
    const fonts = Object.fromEntries(await Promise.all(Object.entries({ body: "Jost-Regular.ttf", medium: "Jost-Medium.ttf", heading: "BarlowCondensed-Light.ttf", fallback: "NotoSansDevanagari-Regular.ttf" }).map(async ([key, file]) => [key, await asset(file)]))) as ProposalAssets["fonts"];
    return { photos, fonts };
  })().catch(error => { packaged = undefined; throw error; });
  const packagedAssets = await packaged;
  const original = (logoSvg ?? await readFile(new URL("../../assets/lisno-logo.svg", import.meta.url))).toString("utf8");
  const logoMetadata = await sharp(Buffer.from(original)).metadata();
  if (logoMetadata.format !== "svg" || !logoMetadata.width || !logoMetadata.height || !/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/u.test(original)) throw new TypeError("The proposal logo must be a valid SVG.");
  // Preserve the existing vector emblem and wordmark, recolored for the dark proposal panels.
  const inner = original.replace(/^<svg[^>]*>/u, "").replace(/<\/svg>\s*$/u, "");
  const white = inner.replaceAll('fill="#1E183B"', 'fill="#FFFFFF"');
  const branded = `<svg width="110" height="30" viewBox="0 0 110 30" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="emblem"><rect width="30" height="30"/></clipPath></defs><circle cx="14.5" cy="15" r="14" fill="#d1c281"/>${white}<g clip-path="url(#emblem)">${inner}</g></svg>`;
  const logo = await sharp(Buffer.from(branded)).resize({ width: 660 }).png().toBuffer();
  return { ...packagedAssets, logo };
}
