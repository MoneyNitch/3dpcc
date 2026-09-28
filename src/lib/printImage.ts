export async function readPrintImage(image: FormDataEntryValue | null): Promise<string | null> {
  if (image === null) return null;
  if (image instanceof File && !image.name && !image.size) return null;
  if (!(image instanceof File) || !image.size || image.size > 5 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
    throw new Error("Bitte ein PNG-, JPEG- oder WebP-Bild bis 5 MB wählen.");
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  const valid = image.type === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : image.type === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new Error("Ungültige Bilddatei.");
  return `data:${image.type};base64,${bytes.toString("base64")}`;
}