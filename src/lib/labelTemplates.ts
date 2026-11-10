import { z } from "zod";

export const labelElementSchema = z.strictObject({
  id: z.string().min(1).max(100),
  type: z.enum(["text", "qr", "barcode"]),
  content: z.string().max(500),
  x: z.number().finite().min(0).max(300),
  y: z.number().finite().min(0).max(300),
  width: z.number().finite().min(1).max(300),
  height: z.number().finite().min(1).max(300),
  fontSize: z.number().finite().min(5).max(40),
});
export const labelTemplateSchema = z.strictObject({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  width: z.number().finite().min(15).max(300),
  height: z.number().finite().min(15).max(300),
  elements: z.array(labelElementSchema).min(1).max(20),
}).superRefine((template, context) => {
  if (new Set(template.elements.map((element) => element.id)).size !== template.elements.length) {
    context.addIssue({ code: "custom", message: "Element IDs must be unique." });
  }
  for (const element of template.elements) {
    if (element.x + element.width > template.width + 0.001 || element.y + element.height > template.height + 0.001) {
      context.addIssue({ code: "custom", message: "Elements must fit inside the label." });
    }
    if (element.type === "qr" && (Math.min(element.width, element.height) < 12)) {
      context.addIssue({ code: "custom", message: "QR codes must be at least 12 mm." });
    }
    if (element.type === "barcode" && element.height < 8) {
      context.addIssue({ code: "custom", message: "Barcodes must be at least 8 mm high." });
    }
    if (element.type !== "text" && template.elements.some((other) => other.id !== element.id &&
      element.x < other.x + other.width && element.x + element.width > other.x &&
      element.y < other.y + other.height && element.y + element.height > other.y)) {
      context.addIssue({ code: "custom", message: "Codes must not overlap other elements." });
    }
  }
});
export const labelTemplatesSchema = z.array(labelTemplateSchema).max(100)
  .refine((templates) => new Set(templates.map((template) => template.id)).size === templates.length);
export type LabelTemplate = z.infer<typeof labelTemplateSchema>;
export type LabelElement = z.infer<typeof labelElementSchema>;

export function createLabelTemplate(id: string, name: string): LabelTemplate {
  return {
    id, name, width: 70, height: 40,
    elements: [
      { id: `${id}-name`, type: "text", content: "{{name}}", x: 3, y: 3, width: 64, height: 9, fontSize: 11 },
      { id: `${id}-id`, type: "text", content: "{{id}}", x: 3, y: 13, width: 40, height: 12, fontSize: 7 },
      { id: `${id}-qr`, type: "qr", content: "{{id}}", x: 46, y: 14, width: 21, height: 21, fontSize: 10 },
    ],
  };
}

export function labelContent(content: string, item: { name: string; id: string; numericId?: number }): string {
  return content.replace(/\{\{(name|id|numericId)\}\}/g, (_, field: "name" | "id" | "numericId") => {
    if (field !== "numericId") return item[field];
    if (item.numericId === undefined) throw new Error("labels.error.numericId");
    return String(item.numericId);
  });
}

export function moveLabelElement(element: LabelElement, x: number, y: number, template: Pick<LabelTemplate, "width" | "height">): LabelElement {
  return {
    ...element,
    x: Math.round(Math.max(0, Math.min(x, template.width - element.width)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(y, template.height - element.height)) * 10) / 10,
  };
}
