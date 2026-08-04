import { expect, test } from "vitest";

import { isTemplate, outputName } from "../naming";

test("isTemplate detects the .hbs extension", () => {
  expect(isTemplate("page.tsx.hbs")).toBe(true);
  expect(isTemplate("page.tsx")).toBe(false);
});

test("outputName strips the .hbs extension", () => {
  expect(outputName("page.tsx.hbs")).toBe("page.tsx");
});

test("outputName keeps non-.hbs names unchanged", () => {
  expect(outputName("page.tsx")).toBe("page.tsx");
});

test("outputName renames gitignore to .gitignore after stripping", () => {
  expect(outputName("gitignore.hbs")).toBe(".gitignore");
});
