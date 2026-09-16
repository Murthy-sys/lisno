import { readFileSync } from "node:fs";

export const browserRecordedWebm = readFileSync(new URL("../fixtures/project-chat-audio/chromium-voice.webm", import.meta.url));
export const otherAudio = [
  {filename: "silent.mp3", mimeType: "audio/mpeg"},
  {filename: "silent.m4a", mimeType: "audio/mp4"},
  {filename: "silent.ogg", mimeType: "audio/ogg"}
].map(item => ({...item, bytes: readFileSync(new URL(`../fixtures/project-chat-audio/${item.filename}`, import.meta.url))}));
