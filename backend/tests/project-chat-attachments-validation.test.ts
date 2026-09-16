import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { inspectChatAttachment, sanitizeChatFilename } from "../src/domain/project-chat-attachment-validation.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { tinyMp4, silentWebm, tinyWebm } from "./helpers/project-chat-media-fixtures.js";
function wav() {
  const data = Buffer.alloc(64); data.write("RIFF"); data.writeUInt32LE(56, 4); data.write("WAVEfmt ", 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(20, 40); return data;
}
function zip(entries: Record<string, string>) {
  const records: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(text); let crc = 0xffffffff;
    for (const byte of data) {crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);}
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt32LE(crc, 16); index.writeUInt32LE(data.length, 20); index.writeUInt32LE(data.length, 24); index.writeUInt16LE(filename.length, 28); index.writeUInt32LE(offset, 42);
    records.push(local, filename, data); central.push(index, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, directory, end]);
}
async function inspect(bytes: Buffer, filename: string, claimedMimeType = "application/octet-stream") {
  const f = createAttachmentFixture(); f.files.set("inspect", bytes);
  const read = vi.spyOn(f.storage, "readRange");
  const result = await inspectChatAttachment(f.storage, "inspect", {id: "synthetic-file", filename, claimedMimeType, byteSize: bytes.length});
  expect(read.mock.calls.every(([, options]) => options.length <= 1024 * 1024)).toBe(true);
  return result;
}
describe("chat attachment bounded signature and container validation", () => {
  it("accepts real JPEG/PNG/WebP/GIF/TIFF images and a structurally valid PDF", async () => {
    const image = sharp({create: {width: 2, height: 2, channels: 3, background: "white"}});
    for (const [extension, bytes] of [["jpg", await image.clone().jpeg().toBuffer()], ["png", await image.clone().png().toBuffer()], ["webp", await image.clone().webp().toBuffer()], ["tif", await image.clone().tiff().toBuffer()], ["gif", Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")]] as const) expect(await inspect(bytes, `image.${extension}`)).toMatchObject({kind: "image", byteSize: bytes.length});
    const pdf = await PDFDocument.create(); pdf.addPage([50, 50]);
    expect(await inspect(Buffer.from(await pdf.save()), "document.pdf", "application/pdf")).toMatchObject({kind: "document", mimeType: "application/pdf"});
  });
  it("distinguishes video and audio inside real MP4/WebM containers and accepts WAV", async () => {
    expect(await inspect(tinyMp4, "video.mp4", "video/mp4")).toMatchObject({kind: "video", mimeType: "video/mp4"});
    expect(await inspect(tinyWebm, "video.webm", "video/webm")).toMatchObject({kind: "video", mimeType: "video/webm"});
    expect(await inspect(silentWebm, "voice.webm", "audio/webm")).toMatchObject({kind: "audio", mimeType: "audio/webm"});
    expect(await inspect(wav(), "voice.wav", "audio/wav")).toMatchObject({kind: "audio", mimeType: "audio/wav"});
  });
  it("distinguishes Office documents from opaque ZIP archives through bounded central-directory inspection", async () => {
    expect(await inspect(zip({"site.txt": "Synthetic note"}), "notes.zip")).toMatchObject({kind: "archive", mimeType: "application/zip"});
    for (const [extension, root, main, mime] of [
      ["docx", "word/document.xml", "wordprocessingml.document", "wordprocessingml.document"],
      ["xlsx", "xl/workbook.xml", "spreadsheetml.sheet", "spreadsheetml.sheet"],
      ["pptx", "ppt/presentation.xml", "presentationml.presentation", "presentationml.presentation"]
    ]) {
      const bytes = zip({"[Content_Types].xml": `<Types><Override ContentType="application/vnd.openxmlformats-officedocument.${main}.main+xml"/></Types>`, "_rels/.rels": "<Relationships/>", [root!]: "<Document/>"});
      expect(await inspect(bytes, `office.${extension}`)).toMatchObject({kind: "document", mimeType: `application/vnd.openxmlformats-officedocument.${mime}`});
    }
  });
  it("rejects MIME spoofing, truncated containers, unsupported scripts, invalid UTF-8 and disguised HTML", async () => {
    const cases: Array<[Buffer, string, string]> = [
      [Buffer.from("<svg/>"), "image.png", "image/png"], [Buffer.from("<html>Hello</html>"), "note.txt", "text/plain"],
      [Buffer.from([0xff, 0xfe, 0x00, 0x00]), "note.txt", "text/plain"], [Buffer.from("console.log('hi')"), "file.js", "text/plain"],
      [tinyMp4.subarray(0, 32), "video.mp4", "video/mp4"], [zip({"note.txt": "Data"}).subarray(0, 20), "archive.zip", "application/zip"],
      [wav(), "voice.wav", "image/png"], [Buffer.from("%PDF-1.7\n%%EOF"), "fake.pdf", "application/pdf"]
    ];
    for (const [bytes, name, mime] of cases) await expect(inspect(bytes, name, mime)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
  });
  it("rejects unsafe archive names and incomplete/macro Office containers without extracting contents", async () => {
    for (const bytes of [zip({"../secret.txt": "Data"}), zip({"word/document.xml": "<Document/>"}), zip({"word/document.xml": "<Document/>", "_rels/.rels": "<Relationships/>", "[Content_Types].xml": "macroEnabled", "word/vbaProject.bin": "fake macro"})]) await expect(inspect(bytes, "invalid.docx")).rejects.toMatchObject({status: 400});
  });
  it("preserves Unicode while sanitizing paths/control characters and retaining long filename extensions", () => {
    expect(sanitizeChatFilename("../../site\r\nnote.txt")).toBe("sitenote.txt");
    const name = sanitizeChatFilename(`${"😀".repeat(120)}.txt`);
    expect(name.length).toBeLessThanOrEqual(180); expect(name.endsWith(".txt")).toBe(true);
    expect(Buffer.from(name, "utf8").toString("utf8")).toBe(name);
  });
  it("validates UTF-8 and active-document prefixes across storage stream boundaries", async () => {
    const f = createAttachmentFixture(), bytes = Buffer.from("   <html>File</html>");
    f.files.set("split-document", bytes);
    const storage = {...f.storage, open: async () => Readable.from([Buffer.from("   "), Buffer.from("<ht"), Buffer.from("ml>File</html>")])};
    await expect(inspectChatAttachment(storage, "split-document", {id: "split-id", filename: "note.txt", claimedMimeType: "text/plain", byteSize: bytes.length})).rejects.toMatchObject({status: 400});
    const unicode = Buffer.from("Site 👷 update"); f.files.set("split-unicode", unicode);
    const valid = {...f.storage, open: async () => Readable.from([unicode.subarray(0, 7), unicode.subarray(7, 8), unicode.subarray(8)])};
    expect(await inspectChatAttachment(valid, "split-unicode", {id: "unicode-id", filename: "note.txt", claimedMimeType: "text/plain", byteSize: unicode.length})).toMatchObject({kind: "document", mimeType: "text/plain"});
  });
  it("rejects mismatched extensions even when both formats belong to the same supported category", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage([50, 50]);
    const png = await sharp({create: {width: 2, height: 2, channels: 3, background: "white"}}).png().toBuffer();
    const docx = zip({"[Content_Types].xml": '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', "_rels/.rels": "<Relationships/>", "word/document.xml": "<Document/>"});
    for (const [bytes, filename] of [[Buffer.from(await pdf.save()), "invoice.docx"], [docx, "report.pdf"], [docx, "report.xlsx"], [wav(), "recording.mp3"], [png, "photo.jpg"], [tinyMp4, "video.webm"]] as const) {
      await expect(inspect(bytes, filename)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID", message: "The filename extension does not match the file contents."});
    }
    const jpeg = await sharp(png).jpeg().toBuffer();
    expect(await inspect(jpeg, "photo.jpeg")).toMatchObject({mimeType: "image/jpeg"});
    const tiff = await sharp(png).tiff().toBuffer();
    expect(await inspect(tiff, "plan.tiff")).toMatchObject({mimeType: "image/tiff"});
  });
  it("requires real PDF cross references, valid object targets, and a nonempty page tree", async () => {
    const document = await PDFDocument.create(); document.addPage([50, 50]);
    const classic = Buffer.from(await document.save({useObjectStreams: false}));
    const compressed = Buffer.from(await document.save());
    expect(await inspect(classic, "classic.pdf")).toMatchObject({mimeType: "application/pdf"});
    expect(await inspect(compressed, "compressed.pdf")).toMatchObject({mimeType: "application/pdf"});
    const source = classic.toString("latin1"), objectOffset = source.indexOf("1 0 obj");
    const emptyDocument = await PDFDocument.create();
    const invalidFiles = [
      Buffer.from("%PDF-1.7\nxref\nstartxref\n9\n%%EOF\n"),
      Buffer.from(source.replace(/startxref\s+\d+/, `startxref\n${objectOffset}`), "latin1"),
      Buffer.from(source.replace(/(\d{10})( \d{5} n)/, "0000000009$2"), "latin1"),
      Buffer.from(source.replace(/\bendobj\b/, "broken"), "latin1"),
      Buffer.from(compressed.toString("latin1").replace("/Type /XRef", "/Type /Fail"), "latin1"),
      Buffer.from(await emptyDocument.save({addDefaultPage: false, useObjectStreams: false}))
    ];
    for (const bytes of invalidFiles) await expect(inspect(bytes, "invalid.pdf")).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
  });
  it("bounds PDF buffering to one validation at a time and releases its slot after abort or size mismatch", async () => {
    const document = await PDFDocument.create(); document.addPage([50, 50]); const pdf = Buffer.from(await document.save());
    const f = createAttachmentFixture(); f.files.set("bounded-pdf", pdf);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => {entered = resolve;});
    const paused = new Promise<void>(resolve => {release = resolve;});
    const controller = new AbortController();
    const slowStorage = {...f.storage, open: async () => Readable.from((async function* () {entered(); await paused; yield pdf;})())};
    const input = {id: "bounded-pdf-id", filename: "document.pdf", claimedMimeType: "application/pdf", byteSize: pdf.length};
    const first = inspectChatAttachment(slowStorage, "bounded-pdf", {...input, signal: controller.signal});
    const aborted = expect(first).rejects.toMatchObject({name: "AbortError"});
    await ready;
    await expect(inspectChatAttachment(f.storage, "bounded-pdf", input)).rejects.toMatchObject({status: 503, code: "CHAT_ATTACHMENT_VALIDATION_BUSY"});
    controller.abort(); release(); await aborted;
    const shortStorage = {...f.storage, open: async () => Readable.from([pdf.subarray(0, -1)])};
    await expect(inspectChatAttachment(shortStorage, "bounded-pdf", input)).rejects.toMatchObject({status: 400});
    expect(await inspectChatAttachment(f.storage, "bounded-pdf", input)).toMatchObject({mimeType: "application/pdf"});
  });
});
