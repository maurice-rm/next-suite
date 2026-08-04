import Handlebars from "handlebars";

import { getPackageManagerEntry } from "@/package-managers";

Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("not", (a) => !a);
Handlebars.registerHelper("and", (...args) => args.slice(0, -1).every(Boolean));
Handlebars.registerHelper("or", (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper(
  "includes",
  (arr, val) => Array.isArray(arr) && arr.includes(val),
);
// Emit the block body verbatim — lets templates contain literal `{{ }}` (e.g.
// GitHub Actions `${{ }}` expressions) that Handlebars would otherwise consume.
Handlebars.registerHelper("raw", (options) => options.fn());
Handlebars.registerHelper(
  "execPrefix",
  (pm) => getPackageManagerEntry(pm).exec,
);

/**
 * Render a Handlebars template string with the given data. HTML escaping is
 * disabled because we generate source code, not HTML.
 *
 * @param content - The template source.
 * @param data - Values exposed to the template.
 * @returns The rendered output.
 */
export const renderString = (content: string, data: unknown): string =>
  Handlebars.compile(content, { noEscape: true })(data);
