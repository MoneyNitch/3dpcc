import QRCode from "qrcode";
import bwipjs from "bwip-js/node";
import { escapeHtml } from "./invoice";
import { labelContent, labelTemplateSchema, type LabelTemplate } from "./labelTemplates";

export class LabelError extends Error {}

function image(svg: string, x: number, y: number, width: number, height: number, stretch = false): string {
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${stretch ? "none" : "xMidYMid meet"}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" />`;
}

export async function renderLabel(template: LabelTemplate, item: { id: string; name: string; numericId?: number }): Promise<string> {
  const parsed = labelTemplateSchema.safeParse(template);
  if (!parsed.success) throw new LabelError("labels.error.input");
  const parts: string[] = [];
  for (const element of template.elements) {
    if (element.content.includes("{{numericId}}") && item.numericId === undefined) throw new LabelError("labels.error.numericId");
    const content = labelContent(element.content, item);
    if (element.type !== "text" && !content.trim()) throw new LabelError("labels.error.code");
    if (element.type === "text") {
      const size = element.fontSize * 25.4 / 72;
      const columns = Math.max(1, Math.floor(element.width / (size * 0.65)));
      const lines = content.split(/\r?\n/).flatMap((line) => {
        const chars = Array.from(line);
        const wrapped: string[] = [];
        for (let offset = 0; offset < chars.length; offset += columns) wrapped.push(chars.slice(offset, offset + columns).join(""));
        return wrapped.length ? wrapped : [""];
      });
      if (lines.length * size * 1.3 > element.height) throw new LabelError("labels.error.textFit");
      parts.push(`<text x="${element.x}" y="${element.y + size}" font-size="${size}" font-family="Arial,sans-serif" fill="black">${lines.map((line, index) =>
        `<tspan x="${element.x}" dy="${index ? size * 1.3 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>`);
    } else if (element.type === "qr") {
      if (new TextEncoder().encode(content).length > 500) throw new LabelError("labels.error.code");
      const qr = QRCode.create(content, { errorCorrectionLevel: "M" });
      if (Math.min(element.width, element.height) / (qr.modules.size + 8) < 0.3) throw new LabelError("labels.error.codeFit");
      const svg = await QRCode.toString(content, { type: "svg", margin: 4, errorCorrectionLevel: "M" });
      parts.push(image(svg, element.x, element.y, element.width, element.height));
    } else {
      if (!/^[\x20-\x7e]{1,100}$/.test(content)) throw new LabelError("labels.error.barcode");
      const svg = bwipjs.toSVG({ bcid: "code128", text: content, scale: 1, height: 10, includetext: false, paddingwidth: 10 });
      const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      if (!viewBox || element.width / Number(viewBox[1]) < 0.19) throw new LabelError("labels.error.codeFit");
      parts.push(image(svg, element.x, element.y, element.width, element.height, true));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width}mm" height="${template.height}mm" viewBox="0 0 ${template.width} ${template.height}"><rect width="100%" height="100%" fill="white"/>${parts.join("")}</svg>`;
}

export function labelPrintDocument(template: LabelTemplate, svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(template.name)}</title><style>
@page{size:${template.width}mm ${template.height}mm;margin:0}
html,body{margin:0;padding:0;width:${template.width}mm;height:${template.height}mm}
img{display:block;width:${template.width}mm;height:${template.height}mm}
</style></head><body><img alt="${escapeHtml(template.name)}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`;
}
