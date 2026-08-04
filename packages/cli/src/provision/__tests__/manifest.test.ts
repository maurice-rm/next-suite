import { expect, test } from "vitest";

import { parseManifest, requireProxied } from "../manifest";

const valid = JSON.stringify({
  version: 1,
  name: "acme-app",
  packageManager: "pnpm",
  auth: "none",
  email: "none",
  githubActions: [],
  production: { mode: "proxied" },
});

test("parseManifest accepts a valid manifest", () => {
  expect(parseManifest(valid).name).toBe("acme-app");
});

test("parseManifest rejects invalid JSON", () => {
  expect(() => parseManifest("{ not json")).toThrow(/valid JSON/);
});

test("parseManifest rejects an unsupported version", () => {
  expect(() =>
    parseManifest(JSON.stringify({ version: 2, name: "x" })),
  ).toThrow(/version/);
});

test("parseManifest rejects missing or empty name", () => {
  expect(() => parseManifest(JSON.stringify({ version: 1 }))).toThrow(/name/);
  expect(() => parseManifest(JSON.stringify({ version: 1, name: "" }))).toThrow(
    /name/,
  );
});

test("parseManifest rejects non-object JSON", () => {
  expect(() => parseManifest("null")).toThrow(/must be a JSON object/);
  expect(() => parseManifest("42")).toThrow(/must be a JSON object/);
  expect(() => parseManifest("[1,2,3]")).toThrow(/must be a JSON object/);
});

test("requireProxied passes for proxied", () => {
  expect(() => requireProxied(parseManifest(valid))).not.toThrow();
});

test("requireProxied throws for standalone or missing production", () => {
  const standalone = parseManifest(
    JSON.stringify({
      ...JSON.parse(valid),
      production: { mode: "standalone" },
    }),
  );
  expect(() => requireProxied(standalone)).toThrow(/proxied/);
  const none = parseManifest(
    JSON.stringify({ ...JSON.parse(valid), production: undefined }),
  );
  expect(() => requireProxied(none)).toThrow(/proxied/);
});

test("parseManifest accepts safe project names", () => {
  expect(
    parseManifest(JSON.stringify({ version: 1, name: "acme-app" })).name,
  ).toBe("acme-app");
  expect(
    parseManifest(JSON.stringify({ version: 1, name: "my_app.v2" })).name,
  ).toBe("my_app.v2");
});

test("parseManifest rejects unsafe project names", () => {
  expect(() =>
    parseManifest(JSON.stringify({ version: 1, name: "foo; touch x" })),
  ).toThrow(/unsafe project name/);
  expect(() =>
    parseManifest(JSON.stringify({ version: 1, name: "a b" })),
  ).toThrow(/unsafe project name/);
  expect(() =>
    parseManifest(JSON.stringify({ version: 1, name: "client's-app" })),
  ).toThrow(/unsafe project name/);
});

test("parseManifest rejects a digit-leading project name (useradd needs a letter start)", () => {
  expect(() =>
    parseManifest(JSON.stringify({ version: 1, name: "2048app" })),
  ).toThrow(/unsafe project name/);
  expect(
    parseManifest(JSON.stringify({ version: 1, name: "acme-app" })).name,
  ).toBe("acme-app");
});

test("a name useradd would reject is caught before the run touches the server", () => {
  const tooLong = "a".repeat(33);
  expect(() =>
    parseManifest(
      JSON.stringify({ version: 1, name: tooLong, packageManager: "pnpm" }),
    ),
  ).toThrow(/unsafe project name/);
  expect(() =>
    parseManifest(
      JSON.stringify({
        version: 1,
        name: "a".repeat(32),
        packageManager: "pnpm",
      }),
    ),
  ).not.toThrow();
});
