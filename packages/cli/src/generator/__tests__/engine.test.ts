import { expect, test } from "vitest";

import { renderString } from "../engine";

test("renderString interpolates without HTML-escaping", () => {
  expect(renderString('const x = "{{v}}";', { v: "a && b < c" })).toBe(
    'const x = "a && b < c";',
  );
});

test("renderString supports the eq helper", () => {
  expect(renderString('{{#if (eq a "x")}}Y{{else}}N{{/if}}', { a: "x" })).toBe(
    "Y",
  );
});

test("renderString supports and/or helpers", () => {
  expect(renderString("{{#if (and a b)}}Y{{/if}}", { a: true, b: true })).toBe(
    "Y",
  );
  expect(renderString("{{#if (or a b)}}Y{{/if}}", { a: false, b: true })).toBe(
    "Y",
  );
});

test("renderString supports the ne, not, and includes helpers", () => {
  expect(renderString('{{#if (ne a "x")}}Y{{/if}}', { a: "z" })).toBe("Y");
  expect(renderString("{{#if (not a)}}Y{{/if}}", { a: false })).toBe("Y");
  expect(
    renderString('{{#if (includes a "x")}}Y{{/if}}', { a: ["x", "y"] }),
  ).toBe("Y");
});

test("raw emits its block body verbatim, leaving mustaches literal", () => {
  expect(renderString("{{{{raw}}}}${{ github.ref }}{{{{/raw}}}}", {})).toBe(
    "${{ github.ref }}",
  );
});

test("execPrefix maps each package manager to its local-bin runner", () => {
  const t = "{{execPrefix packageManager}} lint-staged";
  expect(renderString(t, { packageManager: "npm" })).toBe(
    "npx --no -- lint-staged",
  );
  expect(renderString(t, { packageManager: "pnpm" })).toBe(
    "pnpm exec lint-staged",
  );
  expect(renderString(t, { packageManager: "yarn" })).toBe(
    "yarn exec lint-staged",
  );
  expect(renderString(t, { packageManager: "bun" })).toBe("bunx lint-staged");
});
