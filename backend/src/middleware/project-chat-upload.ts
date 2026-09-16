import Busboy from "busboy";
import type { Request } from "express";
import { Transform, type Readable } from "node:stream";
import { ApiError } from "./errors.js";

/** Invoke only after beginUpload has authenticated membership and reserved a transfer lease. */
export async function consumeChatMultipart<T>(request: Request, options: {sizeBytes: number; signal: AbortSignal}, receive: (file: {
  source: Readable; filename: string; mimeType: string; signal: AbortSignal; multipartComplete: Promise<void>
}) => Promise<T>): Promise<T> {
  const invalid = () => new ApiError(400, "CHAT_ATTACHMENT_INVALID", "Upload exactly one supported file using the file field.");
  const bodyLimit = options.sizeBytes + 64 * 1024;
  const tooLarge = () => new ApiError(413, "CHAT_ATTACHMENT_LIMIT", "The upload body exceeds the reserved file size.");
  const length = Number(request.headers["content-length"]);
  if (Number.isFinite(length) && length > bodyLimit) throw tooLarge();
  let parser: ReturnType<typeof Busboy>;
  try { parser = Busboy({headers: request.headers, defParamCharset: "utf8", limits: {files: 1, fields: 0, parts: 2, fileSize: options.sizeBytes + 1, headerPairs: 32}}); }
  catch { throw invalid(); }
  let resolve!: () => void, reject!: (error: unknown) => void;
  const multipartComplete = new Promise<void>((yes, no) => {resolve = yes; reject = no;});
  void multipartComplete.catch(() => {});
  let transfer: Promise<T> | undefined;
  let seenFile = false;
  let failed = false;
  let bodyBytes = 0;
  const boundedBody = new Transform({transform(chunk: Buffer, _encoding, done) {
    bodyBytes += chunk.length;
    if (bodyBytes > bodyLimit) {done(tooLarge()); return;}
    done(null, chunk);
  }});
  const fail = (error: unknown) => {
    if (failed) return;
    failed = true;
    reject(error); request.unpipe(boundedBody); boundedBody.unpipe(parser); boundedBody.destroy(); parser.destroy();
    // Stop reading a rejected chunked body, including arbitrary multipart epilogues.
    // Close only after the error response flushes so clients receive its retry reason.
    request.pause();
    if (request.res && !request.res.headersSent && !request.res.destroyed) request.res.setHeader("Connection", "close");
    request.res?.once("finish", () => request.destroy());
  };
  boundedBody.once("error", fail);
  const abort = () => fail(new ApiError(408, "CHAT_ATTACHMENT_CANCELLED", "The upload was cancelled or timed out."));
  parser.on("file", (field, source, info) => {
    // Busboy destroys even rejected file streams when the multipart parser closes.
    source.once("error", fail);
    if (seenFile || field !== "file") { source.resume(); fail(invalid()); return; }
    seenFile = true;
    source.once("limit", () => fail(new ApiError(413, "CHAT_ATTACHMENT_LIMIT", "The file exceeds its reserved size.")));
    transfer = receive({source, filename: info.filename, mimeType: info.mimeType, signal: options.signal, multipartComplete});
    void transfer.catch(fail);
  });
  parser.on("field", () => fail(invalid()));
  for (const name of ["filesLimit", "fieldsLimit", "partsLimit"] as const) parser.on(name, () => fail(invalid()));
  parser.once("error", error => fail(error instanceof ApiError ? error : invalid()));
  parser.once("finish", () => seenFile ? resolve() : reject(invalid()));
  request.once("aborted", abort);
  options.signal.addEventListener("abort", abort, {once: true});
  try {
    if (options.signal.aborted) abort(); else request.pipe(boundedBody).pipe(parser);
    try { await multipartComplete; }
    catch (error) { await transfer?.catch(() => {}); throw error; }
    if (!transfer) throw invalid();
    return await transfer;
  } finally {
    request.removeListener("aborted", abort); options.signal.removeEventListener("abort", abort);
    request.unpipe(boundedBody); boundedBody.unpipe(parser); boundedBody.destroy();
  }
}
