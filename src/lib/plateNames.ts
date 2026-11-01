import { z } from "zod";
import type { ParsedPrint } from "./types";
import { ApiError, parse } from "./api/http";

export const plateNameSchema = z.strictObject({
  plateIndex: z.number().int().positive(),
  plateName: z.string().trim().min(1).max(200),
});

export function renamePlate(print: ParsedPrint, value: unknown): ParsedPrint {
  const { plateIndex, plateName } = parse(plateNameSchema, value);
  const plates = print.plates ?? [print.plate];
  const position = plates.findIndex((plate, index) => (plate.plateIndex ?? index + 1) === plateIndex);
  if (position < 0) throw new ApiError(404, "not_found", "Plate not found.");
  const updated = plates.map((plate, index) => index === position ? { ...plate, plateName } : plate);
  return { ...print, plate: updated[0], ...(print.plates ? { plates: updated } : {}) };
}
