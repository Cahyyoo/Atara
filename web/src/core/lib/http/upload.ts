import { ApiError } from "@/core/lib/http/api-response";

/**
 * An uploaded file from a multipart form, refused early when it is too big.
 *
 * The declared size is checked before anything is buffered: formData() reads
 * the whole upload into memory. The real size is checked again after, since
 * a header can say anything.
 */
export async function readUpload(
  request: Request,
  maxBytes: number,
  field = "file"
): Promise<{ file: File; form: FormData }> {
  const tooLarge = () =>
    new ApiError(`That file is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`, 413, "file-too-large");

  const declared = Number(request.headers.get("content-length"));
  // The form's own envelope rides on top of the file.
  if (Number.isFinite(declared) && declared > maxBytes + 64 * 1024) throw tooLarge();

  const form = await request.formData().catch(() => null);
  const file = form?.get(field);
  if (!form || !(file instanceof File)) throw new ApiError("Choose a file to upload.", 400, "file-missing");
  if (file.size > maxBytes) throw tooLarge();
  return { file, form };
}
