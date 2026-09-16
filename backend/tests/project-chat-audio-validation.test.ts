import { describe, expect, it, vi } from "vitest";
import { inspectChatAttachment } from "../src/domain/project-chat-attachment-validation.js";
import { webmInspectionMetadata } from "../src/domain/project-chat-webm-inspection.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { browserRecordedWebm, otherAudio } from "./helpers/project-chat-audio-fixtures.js";
import { silentWebm, tinyWebm } from "./helpers/project-chat-media-fixtures.js";

async function inspect(bytes: Buffer, filename = "voice.webm", claimedMimeType = "audio/webm") {
  const f = createAttachmentFixture(); f.files.set("synthetic-audio", bytes);
  const range = vi.spyOn(f.storage, "readRange");
  try {
    return await inspectChatAttachment(f.storage, "synthetic-audio", {id: "audio-test", byteSize: bytes.length, filename, claimedMimeType});
  } finally {
    expect(range.mock.calls.length).toBeLessThanOrEqual(8192);
    expect(range.mock.calls.reduce((sum, [, options]) => sum + options.length, 0)).toBeLessThanOrEqual(12 * 1024 * 1024);
    for (const [, options] of range.mock.calls) {
      expect(options.length).toBeLessThanOrEqual(1024 * 1024);
      expect(options.offset + options.length).toBeLessThanOrEqual(bytes.length);
    }
  }
}
// Fixed offsets in the documented native fixture, not offsets found by
// searching codec payloads: Segment size, first/second Cluster size.
const sizes = [{offset: 40, end: 21429}, {offset: 150, end: 4991}, {offset: 4995, end: 21429}];
function finiteRecording() {
  const bytes = Buffer.from(browserRecordedWebm);
  for (const {offset, end} of sizes) bytes.writeBigUInt64BE((1n << 56n) | BigInt(end - offset - 8), offset);
  return bytes;
}
function altered(offset: number, value: number) {const bytes = Buffer.from(browserRecordedWebm); bytes[offset] = value; return bytes;}

describe("browser-recorded chat audio validation", () => {
  it("accepts native Chromium timeslice chunks joined into an unchanged recording", async () => {
    expect(browserRecordedWebm.length).toBe(21429);
    for (const {offset} of sizes) expect(browserRecordedWebm.subarray(offset, offset + 8).toString("hex")).toBe("01ffffffffffffff");
    expect(await inspect(browserRecordedWebm)).toMatchObject({kind: "audio", mimeType: "audio/webm", byteSize: 21429});
    expect(await inspect(browserRecordedWebm, "voice.webm", "audio/webm;codecs=opus")).toMatchObject({kind: "audio", mimeType: "audio/webm"});
  });
  it("handles short unknown-size fields and structurally delimited multiple Clusters", async () => {
    let bytes = Buffer.from(browserRecordedWebm);
    for (const {offset} of [...sizes].reverse()) bytes = Buffer.concat([bytes.subarray(0, offset), Buffer.from([0xff]), bytes.subarray(offset + 8)]);
    expect(await inspect(bytes)).toMatchObject({kind: "audio", mimeType: "audio/webm"});
    expect(await inspect(finiteRecording())).toMatchObject({kind: "audio", mimeType: "audio/webm"});
    expect(await inspect(Buffer.concat([finiteRecording(), Buffer.from("ec80", "hex")]))).toMatchObject({kind: "audio", mimeType: "audio/webm"});
  });
  it("retains finite WebM, video classification and MP3/M4A/Ogg support", async () => {
    expect(await inspect(silentWebm)).toMatchObject({kind: "audio"});
    expect(await inspect(tinyWebm, "video.webm", "video/webm")).toMatchObject({kind: "video", mimeType: "video/webm"});
    for (const {bytes, filename, mimeType} of otherAudio) expect(await inspect(bytes, filename, mimeType)).toMatchObject({kind: "audio", mimeType});
  });
  it("does not mistake container signatures in opaque codec packets for element boundaries", async () => {
    const bytes = Buffer.from(browserRecordedWebm);
    // Inside the first packet, beyond its Block header.
    Buffer.from("1f43b67501ffffffffffffff1654ae6b", "hex").copy(bytes, 180);
    expect(await inspect(bytes)).toMatchObject({kind: "audio"});
  });
  it("validates a five-minute packet sequence within the existing read/work budgets", async () => {
    const clusters = Array.from({length: 1000}, (_, index) => {
      const timestamp = Buffer.alloc(6); timestamp.set([0xe7, 0x84]); timestamp.writeUInt32BE(index * 300, 2);
      return Buffer.concat([browserRecordedWebm.subarray(146, 158), timestamp, browserRecordedWebm.subarray(161, 4991)]);
    });
    const bytes = Buffer.concat([browserRecordedWebm.subarray(0, 146), ...clusters]);
    expect(await inspect(bytes)).toMatchObject({kind: "audio", byteSize: bytes.length});
  });
  it("accepts finite fixed, Xiph and EBML lacing with real Opus packets", async () => {
    const packet = browserRecordedWebm.subarray(168, 1127);
    for (const [flag, lace] of [[0x84, Buffer.from([1])], [0x82, Buffer.from([1, 255, 255, 255, 194])], [0x86, Buffer.from([1, 0x43, 0xbf])]] as const) {
      const body = Buffer.concat([Buffer.from([0x81, 0, 0, flag]), lace, packet, packet]);
      const header = Buffer.alloc(3); header[0] = 0xa3; header.writeUInt16BE(0x4000 | body.length, 1);
      expect(await inspect(Buffer.concat([browserRecordedWebm.subarray(0, 161), header, body]))).toMatchObject({kind: "audio"});
    }
  });
  it.each([
    ["truncated packet", browserRecordedWebm.subarray(0, -1)],
    ["truncated element header", browserRecordedWebm.subarray(0, 160)],
    ["missing Segment", browserRecordedWebm.subarray(0, 36)],
    ["unknown Tracks size", altered(82, 0xff)],
    ["unknown Block size", altered(162, 0xff)],
    ["unknown Timestamp size", altered(159, 0xff)],
    ["missing Tracks", Buffer.concat([browserRecordedWebm.subarray(0, 78), browserRecordedWebm.subarray(146)])],
    ["missing audio settings", altered(131, 0xec)],
    ["non-media track only", altered(100, 17)],
    ["undeclared Block track", altered(164, 0x82)],
    ["invalid element VINT", altered(150, 0)],
    ["finite cluster cut short", finiteRecording().subarray(0, -1)]
  ])("rejects %s without unsafe reads", async (_name, bytes) => {
    await expect(inspect(bytes as Buffer)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
  });
  it("rejects unsafe finite lengths, excessive metadata and excessive parser work", async () => {
    const unsafe = Buffer.from(browserRecordedWebm); unsafe.writeBigUInt64BE(0x01fffffffffffffen, 150);
    const metadata = Buffer.concat([browserRecordedWebm.subarray(0, 78), Buffer.from("1654ae6b240001", "hex"), Buffer.alloc(256 * 1024 + 1), browserRecordedWebm.subarray(146)]);
    const work = Buffer.concat([browserRecordedWebm, Buffer.from("ec80".repeat(65_536), "hex")]);
    for (const bytes of [unsafe, metadata, work]) await expect(inspect(bytes)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
  });
  it("rejects malformed Block lacing without decoding codec packets", async () => {
    const fixed = altered(167, 0x84); fixed[168] = 6;
    const xiph = altered(167, 0x82); xiph[168] = 255; xiph.fill(255, 169, 1127);
    const ebml = altered(167, 0x86); ebml[168] = 2; ebml[169] = 0;
    for (const bytes of [fixed, xiph, ebml]) await expect(inspect(bytes)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
  });
  it("preserves MIME/extension checks and rejects an audio claim for video", async () => {
    for (const [bytes, name, mime] of [[browserRecordedWebm, "voice.mp3", "audio/mpeg"], [browserRecordedWebm, "voice.webm", "image/png"], [tinyWebm, "video.webm", "audio/webm"]] as const) {
      await expect(inspect(bytes, name, mime)).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
    }
  });
  it("honors cancellation even while parsing cached headers", async () => {
    const controller = new AbortController(); let checks = 0;
    const original = controller.signal.throwIfAborted.bind(controller.signal);
    vi.spyOn(controller.signal, "throwIfAborted").mockImplementation(() => {if (++checks === 20) controller.abort(); original();});
    const read = vi.fn(async (offset: number, length: number) => browserRecordedWebm.subarray(offset, offset + length));
    await expect(webmInspectionMetadata({size: browserRecordedWebm.length, signal: controller.signal, read})).rejects.toMatchObject({name: "AbortError"});
    expect(read).toHaveBeenCalledOnce();
  });
});
