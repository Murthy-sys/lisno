# Synthetic audio regression fixtures

`chromium-voice.webm` is the unmodified 21,429-byte result of a real Chromium
`MediaRecorder`, captured on 2026-09-16 from a Web Audio oscillator connected to
`createMediaStreamDestination()`. It contains no microphone or personal audio.
Recording used `audio/webm;codecs=opus`, `start(1000)`, and concatenated all three
`dataavailable` chunks (3,060, 16,438 and 1,931 bytes) after stop. Chromium decoded
it as 1.32 seconds, 48 kHz, two channels. Its Segment and both Clusters use
eight-byte unknown-size EBML fields. This reproduces the former upload failure;
it must not be replaced by a remuxed or FFmpeg-generated WebM.

`silent.mp3`, `silent.m4a`, and `silent.ogg` are 0.05-second silent mono files,
generated using FFmpeg's `anullsrc=r=48000:cl=mono` input and, respectively,
`libmp3lame`, `aac` (faststart), and `libopus`. These preserve coverage of other
supported audio containers without requiring encoders in the test environment.
