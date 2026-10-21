import { ApiError } from "@/core/lib/http/api-response";

/** The form's own envelope rides on top of the file. */
const ENVELOPE_BYTES = 64 * 1024;

/**
 * A multipart form, read with a hard cap on how much of it is held.
 *
 * formData() buffers the whole body, and the only guard used to be the
 * declared Content-Length -- which a chunked upload simply leaves out (it
 * read as 0 and passed). The body is now counted as it streams in and cut off
 * the moment it passes the cap, whatever the headers said. `tooLarge` is
 * thrown when that happens; null means the body was not a form at all.
 */
export async function readCappedForm(
  request: Request,
  maxBytes: number,
  tooLarge: () => Error
): Promise<FormData | null> {
  const limit = maxBytes + ENVELOPE_BYTES;

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw tooLarge();
  if (!request.body) return null;

  let received = 0;
  let exceeded = false;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > limit) {
          exceeded = true;
          controller.error(new Error("upload-too-large"));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );

  const capped = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: counted,
    // Required by Node's fetch for a streamed body.
    duplex: "half",
  } as RequestInit);

  const form = await capped.formData().catch(() => null);
  if (exceeded) throw tooLarge();
  return form;
}

/**
 * An uploaded file from a multipart form, refused when it is too big: while
 * it streams in (readCappedForm), and by the file's own size after.
 */
export async function readUpload(
  request: Request,
  maxBytes: number,
  field = "file"
): Promise<{ file: File; form: FormData }> {
  const tooLarge = () =>
    new ApiError(`That file is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`, 413, "file-too-large");

  const form = await readCappedForm(request, maxBytes, tooLarge);
  const file = form?.get(field);
  if (!form || !(file instanceof File)) throw new ApiError("Choose a file to upload.", 400, "file-missing");
  if (file.size > maxBytes) throw tooLarge();
  return { file, form };
}
