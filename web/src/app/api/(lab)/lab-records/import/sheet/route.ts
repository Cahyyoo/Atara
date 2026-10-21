import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { readCappedForm } from "@/core/lib/http/upload";
import { readWorkbookAsText } from "@/core/lib/sheets/xlsx-read";

/**
 * An uploaded workbook, flattened to the text the paste box already takes.
 *
 * Deliberately not an import of its own. It hands back the sheet as
 * tab-separated text and stops there, so the preview, the matching and the
 * save all stay on the one path a pasted block travels -- two importers would
 * be two sets of rules about what a column means, and the drift between them
 * would show up as a sheet that works one way and not the other.
 *
 * It also means whoever uploaded the file can see what was read out of it
 * before anything is written, which a silent binary upload would not.
 */

/**
 * Bigger than any results sheet and far below what would be worth streaming.
 * The importer's own 5,000-row ceiling is the limit that actually matters;
 * this one is about not reading an arbitrary upload into memory.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const POST = route({ capability: "enterResults" }, async ({ request }) => {
  const tooLarge = () =>
    new ApiError(`That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`, 413, "sheet-too-large");
  // Capped while it streams in, not only by what Content-Length claims: a
  // chunked upload has no such header and used to be buffered whole.
  const form = await readCappedForm(request, MAX_UPLOAD_BYTES, tooLarge);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("Choose a spreadsheet to read.", 400, "sheet-missing");
  }

  if (file.size > MAX_UPLOAD_BYTES) throw tooLarge();

  const read = await readWorkbookAsText(await file.arrayBuffer());
  if (!read.ok) {
    // Told apart because they send somebody to different places: one file is
    // not a workbook, the other is a workbook with nothing in it.
    const messages: Record<typeof read.error, string> = {
      unreadable:
        "That file could not be read as an Excel workbook. Save it as .xlsx, or paste the rows instead.",
      noSheet: "That workbook has no sheets in it.",
    };
    throw new ApiError(messages[read.error], 422, `sheet-${read.error}`);
  }

  return jsonSuccess({ text: read.text });
});
