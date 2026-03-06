import Handlebars from "handlebars";
import { readFileSync } from "fs";
import { join } from "path";

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

export function renderTemplate(templatePath: string, data: Record<string, unknown>): string {
  let template = templateCache.get(templatePath);
  if (!template) {
    const fullPath = join(import.meta.dir, "..", "templates", templatePath);
    const source = readFileSync(fullPath, "utf-8");
    template = Handlebars.compile(source);
    templateCache.set(templatePath, template);
  }
  return template(data);
}
