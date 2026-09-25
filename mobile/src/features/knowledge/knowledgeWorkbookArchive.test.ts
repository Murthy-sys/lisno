import { deflateRawSync } from "node:zlib";
import { inspectQualityWorkbookArchive } from "./knowledgeWorkbookArchive";

const crc32: (crc: number, bytes: Uint8Array, length: number, offset: number) => number = require("pako/lib/zlib/crc32");
interface Member { name: string; data: Buffer; method?: 0 | 8; declaredSize?: number; compressed?: Buffer; descriptor?: "signed" | "unsigned" }
function zip(extra: readonly Member[] = []) {
  const members: readonly Member[] = [{ name: "[Content_Types].xml", data: Buffer.from("<Types/>") }, { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") }, ...extra];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  const starts: number[] = [];
  let position = 0;
  for (const member of members) {
    const name = Buffer.from(member.name);
    const method = member.method ?? 8;
    const compressed = member.compressed ?? (method === 0 ? member.data : deflateRawSync(member.data));
    const crc = crc32(0, member.data, member.data.byteLength, 0) >>> 0;
    const size = member.declaredSize ?? member.data.length;
    const flags = 0x0800 | (member.descriptor ? 8 : 0);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8); header.writeUInt16LE(name.length, 26);
    if (!member.descriptor) { header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(size, 22); }
    const descriptor = member.descriptor ? Buffer.alloc(member.descriptor === "signed" ? 16 : 12) : Buffer.alloc(0);
    const descriptorOffset = member.descriptor === "signed" ? 4 : 0;
    if (member.descriptor === "signed") descriptor.writeUInt32LE(0x08074b50, 0);
    if (member.descriptor) { descriptor.writeUInt32LE(crc, descriptorOffset); descriptor.writeUInt32LE(compressed.length, descriptorOffset + 4); descriptor.writeUInt32LE(size, descriptorOffset + 8); }
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(flags, 8); directory.writeUInt16LE(method, 10); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(size, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(position, 42);
    starts.push(position); local.push(header, name, compressed, descriptor); central.push(directory, name);
    position += header.length + name.length + compressed.length + descriptor.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(position, 16);
  return { bytes: Buffer.concat([...local, directory, end]), starts, directoryStart: position };
}
const buffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

describe("bounded native XLSX archive inspection", () => {
  it("accepts stored and raw-deflated members, including signed and unsigned data descriptors", async () => {
    const archive = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from("<sheet/>"), method: 0 }, { name: "xl/styles.xml", data: Buffer.from("<style/>"), descriptor: "signed" }, { name: "docProps/app.xml", data: Buffer.from("<app/>"), descriptor: "unsigned" }]);
    await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).resolves.toBeUndefined();
  });

  it("rejects a tiny compressed bomb whose real expansion exceeds its forged declared size", async () => {
    const data = Buffer.alloc(8 * 1024 * 1024, 65);
    const archive = zip([{ name: "xl/worksheets/sheet1.xml", data, declaredSize: 32 }]);
    expect(archive.bytes.length).toBeLessThan(16 * 1024);
    await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow("incomplete or inconsistent");
  });

  it("rejects total declared expansion above 32 MiB before inflating", async () => {
    const archive = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from("x"), declaredSize: 32 * 1024 * 1024 }]);
    await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow("expanded workbook is too large");
  });

  it("does not accept trailing compressed bytes or truncated DEFLATE streams", async () => {
    const data = Buffer.from("<sheet>".repeat(2000));
    const compressed = deflateRawSync(data);
    for (const invalid of [Buffer.concat([compressed, Buffer.from([0, 1, 2])]), compressed.subarray(0, compressed.length - 1)]) {
      const archive = zip([{ name: "xl/worksheets/sheet1.xml", data, compressed: invalid }]);
      await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow("incomplete or inconsistent");
    }
  });

  it("rejects local-header inconsistencies, duplicate names, overlapping member offsets and bad CRC", async () => {
    const cases = [zip(), zip([{ name: "XL/WORKBOOK.XML", data: Buffer.from("second workbook") }]), zip(), zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from("<sheet/>"), method: 0 }])];
    cases[0]!.bytes.writeUInt16LE(0, 8); // Local method disagrees with the central directory.
    cases[2]!.bytes.writeUInt32LE(0, cases[2]!.directoryStart + 46 + Buffer.byteLength("[Content_Types].xml") + 42);
    const last = cases[3]!; last.bytes[last.starts[2]! + 30 + Buffer.byteLength("xl/worksheets/sheet1.xml")]! ^= 1;
    for (const archive of cases) await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow("incomplete or inconsistent");
  });

  it("rejects directory bounds, encryption and missing descriptors before model creation", async () => {
    const bound = zip(); bound.bytes.writeUInt32LE(bound.bytes.length, bound.bytes.length - 22 + 16);
    const encrypted = zip(); encrypted.bytes.writeUInt16LE(0x0801, encrypted.directoryStart + 8);
    const descriptor = zip([{ name: "xl/styles.xml", data: Buffer.from("<style/>"), descriptor: "signed" }]);
    descriptor.bytes.writeUInt32LE(99, descriptor.directoryStart - 8);
    for (const archive of [bound, encrypted, descriptor]) await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow(/archive|workbook/u);
  });

  it("yields during inflation and enforces the inspection deadline", async () => {
    const archive = zip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.alloc(200000, 65) }]);
    let timerRan = false;
    const timer = setTimeout(() => { timerRan = true; }, 0);
    await inspectQualityWorkbookArchive(buffer(archive.bytes));
    clearTimeout(timer);
    expect(timerRan).toBe(true);
    const clock = jest.spyOn(globalThis.performance, "now").mockReturnValueOnce(0).mockReturnValue(20_001);
    try { await expect(inspectQualityWorkbookArchive(buffer(archive.bytes))).rejects.toThrow("too long"); }
    finally { clock.mockRestore(); }
  });
});
